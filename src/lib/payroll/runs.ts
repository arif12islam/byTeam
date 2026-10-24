import { asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { employees, payrollAdjustments, payrollItems, payrollRuns, users, type PayrollRunStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { recalc } from "@/lib/attendance/recalc";
import { formatMonth, isValidMonth, toOfficeDate, toOfficeMonth } from "@/lib/time";

import { buildPayrollItems, loadEmployedIn, loadPayrollInputs, monthBounds } from "./inputs";

type Db = ReturnType<typeof getDb>;

export type RunResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const sumPaisa = (values: readonly string[]) => values.reduce((total, v) => total + Math.round(Number(v) * 100), 0);
const paisaToText = (paisa: number) => `${paisa < 0 ? "-" : ""}${Math.floor(Math.abs(paisa) / 100)}.${String(Math.abs(paisa) % 100).padStart(2, "0")}`;

/** Add up money texts exactly, in whole paisa. */
export function sumMoney(values: readonly string[]): string {
  return paisaToText(sumPaisa(values));
}

export type RunSummary = {
  id: string;
  /** YYYY-MM. */
  month: string;
  status: PayrollRunStatus;
  version: number;
  employees: number;
  net: string;
  updatedAt: Date;
};

/** Every run, newest month first. */
export async function listPayrollRuns(db: Pick<Db, "select">): Promise<RunSummary[]> {
  const rows = await db
    .select({
      id: payrollRuns.id,
      month: payrollRuns.month,
      status: payrollRuns.status,
      version: payrollRuns.version,
      updatedAt: payrollRuns.updatedAt,
      employees: count(payrollItems.id),
      net: sql<string>`coalesce(sum(${payrollItems.net}), 0)::text`,
    })
    .from(payrollRuns)
    .leftJoin(payrollItems, eq(payrollItems.runId, payrollRuns.id))
    .groupBy(payrollRuns.id)
    .orderBy(desc(payrollRuns.month));
  return rows.map((r) => ({ ...r, month: r.month.slice(0, 7), net: sumMoney([r.net]) }));
}

/**
 * Makes a draft run for a month and works out its items. One run per month. The
 * month must have started, and pay rules must apply to it.
 */
export async function createDraftRun(db: Db, month: string, actorId: string, options: { today?: string } = {}): Promise<RunResult<{ runId: string }>> {
  if (!isValidMonth(month)) return { ok: false, error: "Choose a month for the payroll run." };
  const today = options.today ?? toOfficeDate(new Date());
  if (month > toOfficeMonth(new Date(`${today}T12:00:00Z`))) {
    return { ok: false, error: `${formatMonth(month)} has not started yet. Choose this month or an earlier one.` };
  }

  const inputs = await loadPayrollInputs(db, month);
  if (inputs.ruleSet === null) {
    return { ok: false, error: `No pay rules apply to ${formatMonth(month)}. Add rules on the Pay rules screen first.` };
  }

  const first = monthBounds(month).first;
  const created = await db
    .insert(payrollRuns)
    .values({ month: first, createdBy: actorId })
    .onConflictDoNothing({ target: payrollRuns.month })
    .returning();
  if (created.length === 0) return { ok: false, error: `There is already a payroll run for ${formatMonth(month)}.` };

  const run = created[0];
  await audit(db, { actorId, action: "payroll_run.create", entity: "payroll_run", entityId: run.id, after: run });

  const result = await recomputeRun(db, run.id, actorId, { today });
  if (!result.ok) return result;
  return { ok: true, runId: run.id };
}

type Tx = Pick<Db, "select" | "insert" | "update" | "delete" | "transaction">;

/**
 * Brings a month's attendance up to date, then works out its items from the
 * stored inputs. Writes only attendance (derived data); the caller saves the
 * items. Run inside the transaction that holds the run's row lock.
 */
async function computeRunItems(tx: Tx, month: string, today: string) {
  const { first, last } = monthBounds(month);
  const to = last < today ? last : today;
  if (to >= first) {
    const ids = (await loadEmployedIn(tx, month)).map((p) => p.id);
    if (ids.length > 0) await recalc(tx, { employeeIds: ids, from: first, to });
  }
  const inputs = await loadPayrollInputs(tx, month);
  if (inputs.ruleSet === null) return null;
  return { inputs, ...buildPayrollItems(inputs) };
}

type Computed = NonNullable<Awaited<ReturnType<typeof computeRunItems>>>;

async function replaceItems(tx: Tx, runId: string, items: Computed["items"]) {
  await tx.delete(payrollItems).where(eq(payrollItems.runId, runId));
  if (items.length === 0) return;
  await tx.insert(payrollItems).values(
    items.map(({ employee, item }) => ({
      runId,
      employeeId: employee.id,
      payableDays: item.payableDays,
      absentDays: item.absentDays,
      lateCount: item.lateCount,
      unpaidLeaveDays: item.unpaidLeaveDays,
      gross: item.gross,
      deductions: item.deductions,
      additions: item.additions,
      net: item.net,
      breakdown: item.breakdown,
    })),
  );
}

const noRules = (month: string) => `No pay rules apply to ${formatMonth(month)}. Add rules on the Pay rules screen first.`;
const gone = { ok: false as const, error: "That payroll run no longer exists. Reload the page." };
const isFinalized = { ok: false as const, error: "This month is finalized. Unlock it to change it." };

/**
 * Rebuilds a draft run's items from the stored inputs: attendance is recalculated
 * for the month first, so the sheet is never behind the day grid. Bonuses and
 * advances are kept because they belong to the month. A finalized run is refused.
 */
export async function recomputeRun(
  db: Db,
  runId: string,
  actorId: string,
  options: { today?: string } = {},
): Promise<RunResult<{ employees: number; skipped: number }>> {
  const today = options.today ?? toOfficeDate(new Date());

  return db.transaction(async (tx) => {
    // Two people recomputing at once, or one finalizing meanwhile, line up behind this lock.
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).for("update");
    if (!run) return gone;
    if (run.status === "finalized") return isFinalized;

    const month = run.month.slice(0, 7);
    const computed = await computeRunItems(tx, month, today);
    if (computed === null) return { ok: false as const, error: noRules(month) };

    await replaceItems(tx, runId, computed.items);
    await tx.update(payrollRuns).set({ updatedAt: new Date() }).where(eq(payrollRuns.id, runId));
    await audit(tx, {
      actorId,
      action: "payroll_run.recompute",
      entity: "payroll_run",
      entityId: runId,
      after: { month, employees: computed.items.length, skipped: computed.skipped.length, net: sumMoney(computed.items.map((i) => i.item.net)) },
    });
    return { ok: true as const, employees: computed.items.length, skipped: computed.skipped.length };
  });
}

/**
 * Finalizes a draft run (the owner's decision). In one transaction it refreshes
 * attendance and the items one last time, copies the rule set and calendar into
 * the run as a snapshot, and marks the run finalized. From then on the month's
 * attendance, leave, bonuses and advances cannot change until it is unlocked.
 * Refused when there is nothing to pay.
 */
export async function finalizeRun(
  db: Db,
  runId: string,
  actorId: string,
  options: { today?: string } = {},
): Promise<RunResult<{ employees: number; net: string }>> {
  const today = options.today ?? toOfficeDate(new Date());

  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).for("update");
    if (!run) return gone;
    if (run.status === "finalized") return { ok: false as const, error: "This month is already finalized." };

    const month = run.month.slice(0, 7);
    const computed = await computeRunItems(tx, month, today);
    if (computed === null) return { ok: false as const, error: noRules(month) };
    if (computed.items.length === 0) {
      return { ok: false as const, error: `There is nothing to pay for ${formatMonth(month)}. Add salaries to the people who worked, then recompute.` };
    }

    await replaceItems(tx, runId, computed.items);
    const net = sumMoney(computed.items.map((i) => i.item.net));
    const now = new Date();
    const snapshot = {
      month,
      version: run.version,
      ruleSet: computed.inputs.ruleSet,
      weeklyOffDays: computed.inputs.weeklyOffDays,
      workingDays: computed.inputs.workingDays,
      employees: computed.items.length,
      notPaid: computed.skipped.map((s) => ({ employeeId: s.employee.id, empCode: s.employee.empCode, name: s.employee.name, reason: s.reason })),
      net,
      finalizedAt: now.toISOString(),
    };
    const [after] = await tx
      .update(payrollRuns)
      .set({ status: "finalized", ruleSetSnapshot: snapshot, finalizedBy: actorId, finalizedAt: now, updatedAt: now })
      .where(eq(payrollRuns.id, runId))
      .returning();
    await audit(tx, {
      actorId,
      action: "payroll_run.finalize",
      entity: "payroll_run",
      entityId: runId,
      before: { month, status: run.status, version: run.version },
      after: { month, status: after.status, version: after.version, employees: computed.items.length, net },
    });
    return { ok: true as const, employees: computed.items.length, net };
  });
}

export const unlockReasonSchema = z
  .string("Say why you are unlocking this month, in a few words.")
  .trim()
  .min(3, "Say why you are unlocking this month, in a few words.")
  .max(500, "Keep the reason under 500 characters.");

/**
 * Reopens a finalized month (the owner's decision) so attendance, leave, bonuses
 * and advances can change again. A reason is required and goes in the audit log
 * together with the finalized copy it replaces. The run goes back to a draft with
 * its items as they were and its version raised by one, so finalizing again makes
 * a new version. Nothing is recomputed: the owner fixes what needs fixing, then
 * recomputes and finalizes again.
 */
export async function unlockRun(db: Db, runId: string, reason: string, actorId: string): Promise<RunResult<{ version: number }>> {
  const parsed = unlockReasonSchema.safeParse(reason);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).for("update");
    if (!run) return gone;
    if (run.status !== "finalized") return { ok: false as const, error: "This month is not finalized, so there is nothing to unlock." };

    const [after] = await tx
      .update(payrollRuns)
      .set({ status: "draft", version: run.version + 1, ruleSetSnapshot: null, finalizedBy: null, finalizedAt: null, updatedAt: new Date() })
      .where(eq(payrollRuns.id, runId))
      .returning();
    await audit(tx, {
      actorId,
      action: "payroll_run.unlock",
      entity: "payroll_run",
      entityId: runId,
      before: run,
      after: { ...after, reason: parsed.data },
    });
    return { ok: true as const, version: after.version };
  });
}

export type SheetRow = {
  employeeId: string;
  empCode: string;
  name: string;
  department: string | null;
  payableDays: number;
  absentDays: number;
  lateCount: number;
  unpaidLeaveDays: number;
  gross: string;
  deductions: string;
  additions: string;
  net: string;
  /** Plain-English warnings from the calculation, such as missing attendance. */
  warnings: string[];
  /** The lines of the calculation, for the payslip and the review. */
  lines: { code: string; label: string; amount: string; sign: "+" | "-" }[];
};

export type AdjustmentRow = {
  id: string;
  employeeId: string;
  empCode: string;
  name: string;
  type: (typeof payrollAdjustments.$inferSelect)["type"];
  amount: string;
  note: string | null;
};

export type Sheet = {
  run: { id: string; month: string; status: PayrollRunStatus; version: number; updatedAt: Date; finalizedAt: Date | null; finalizedByName: string | null };
  rows: SheetRow[];
  totals: { gross: string; deductions: string; additions: string; net: string };
  /** People employed in the month who have no salary structure, so are not in the sheet. Drafts only. */
  skipped: { employeeId: string; empCode: string; name: string }[];
  /** Things to fix before trusting the sheet. */
  notices: string[];
  adjustments: AdjustmentRow[];
};

/** The run for a month with its items, or null when there is none. */
export async function loadPayrollSheet(db: Db, month: string): Promise<Sheet | null> {
  const { first } = monthBounds(month);
  const [found] = await db
    .select({ run: payrollRuns, finalizedByName: users.name })
    .from(payrollRuns)
    .leftJoin(users, eq(users.id, payrollRuns.finalizedBy))
    .where(eq(payrollRuns.month, first));
  if (!found) return null;
  const { run, finalizedByName } = found;

  const itemRows = await db
    .select({ item: payrollItems, employee: employees })
    .from(payrollItems)
    .innerJoin(employees, eq(employees.id, payrollItems.employeeId))
    .where(eq(payrollItems.runId, run.id))
    .orderBy(asc(employees.empCode));

  const rows: SheetRow[] = itemRows
    .map(({ item, employee }) => {
      const breakdown = item.breakdown as { warnings?: string[]; lines?: SheetRow["lines"] };
      return {
        employeeId: employee.id,
        empCode: employee.empCode,
        name: employee.name,
        department: employee.department,
        payableDays: item.payableDays,
        absentDays: item.absentDays,
        lateCount: item.lateCount,
        unpaidLeaveDays: item.unpaidLeaveDays,
        gross: item.gross,
        deductions: item.deductions,
        additions: item.additions,
        net: item.net,
        warnings: breakdown.warnings ?? [],
        lines: breakdown.lines ?? [],
      };
    })
    .sort((a, b) => a.empCode.localeCompare(b.empCode, undefined, { numeric: true }));

  const adjustmentRows = await db
    .select({
      id: payrollAdjustments.id,
      employeeId: payrollAdjustments.employeeId,
      empCode: employees.empCode,
      name: employees.name,
      type: payrollAdjustments.type,
      amount: payrollAdjustments.amount,
      note: payrollAdjustments.note,
    })
    .from(payrollAdjustments)
    .innerJoin(employees, eq(employees.id, payrollAdjustments.employeeId))
    .where(eq(payrollAdjustments.month, first))
    .orderBy(asc(employees.empCode), asc(payrollAdjustments.createdAt));

  const notices: string[] = [];
  let skipped: Sheet["skipped"] = [];
  if (run.status === "draft") {
    const inputs = await loadPayrollInputs(db, month);
    skipped = inputs.entries
      .filter((e) => e.salary === null)
      .map((e) => ({ employeeId: e.employee.id, empCode: e.employee.empCode, name: e.employee.name }));
    if (inputs.weeklyOffDays.length === 0) {
      notices.push("No weekly off days are set in Settings, so every day counts as a working day. Set them, then recompute.");
    }
    if (inputs.ruleSet === null) notices.push(`No pay rules apply to ${formatMonth(month)}.`);
  }

  return {
    run: { id: run.id, month, status: run.status, version: run.version, updatedAt: run.updatedAt, finalizedAt: run.finalizedAt, finalizedByName },
    rows,
    totals: {
      gross: sumMoney(rows.map((r) => r.gross)),
      deductions: sumMoney(rows.map((r) => r.deductions)),
      additions: sumMoney(rows.map((r) => r.additions)),
      net: sumMoney(rows.map((r) => r.net)),
    },
    skipped,
    notices,
    adjustments: adjustmentRows,
  };
}
