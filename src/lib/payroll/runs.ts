import { asc, count, desc, eq, sql } from "drizzle-orm";

import type { getDb } from "@/db";
import { employees, payrollAdjustments, payrollItems, payrollRuns, type PayrollRunStatus } from "@/db/schema";
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
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
  if (!run) return { ok: false, error: "That payroll run no longer exists. Reload the page." };
  if (run.status === "finalized") return { ok: false, error: "This month is finalized. Unlock it to change it." };

  const month = run.month.slice(0, 7);
  const { first, last } = monthBounds(month);
  const today = options.today ?? toOfficeDate(new Date());

  // Attendance first, so any change since the last look is in the sheet.
  const to = last < today ? last : today;
  if (to >= first) {
    const ids = (await loadEmployedIn(db, month)).map((p) => p.id);
    if (ids.length > 0) await recalc(db, { employeeIds: ids, from: first, to });
  }

  return db.transaction(async (tx) => {
    // Two people recomputing at once, or one finalizing meanwhile, line up behind this lock.
    const [locked] = await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).for("update");
    if (!locked) return { ok: false as const, error: "That payroll run no longer exists. Reload the page." };
    if (locked.status === "finalized") return { ok: false as const, error: "This month is finalized. Unlock it to change it." };

    const inputs = await loadPayrollInputs(tx, month);
    if (inputs.ruleSet === null) {
      return { ok: false as const, error: `No pay rules apply to ${formatMonth(month)}. Add rules on the Pay rules screen first.` };
    }
    const { items, skipped } = buildPayrollItems(inputs);

    await tx.delete(payrollItems).where(eq(payrollItems.runId, runId));
    if (items.length > 0) {
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
    await tx.update(payrollRuns).set({ updatedAt: new Date() }).where(eq(payrollRuns.id, runId));
    await audit(tx, {
      actorId,
      action: "payroll_run.recompute",
      entity: "payroll_run",
      entityId: runId,
      after: { month, employees: items.length, skipped: skipped.length, net: sumMoney(items.map((i) => i.item.net)) },
    });
    return { ok: true as const, employees: items.length, skipped: skipped.length };
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
  run: { id: string; month: string; status: PayrollRunStatus; version: number; updatedAt: Date; finalizedAt: Date | null };
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
  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.month, first));
  if (!run) return null;

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
    run: { id: run.id, month, status: run.status, version: run.version, updatedAt: run.updatedAt, finalizedAt: run.finalizedAt },
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
