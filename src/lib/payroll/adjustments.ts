import { eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { PAYROLL_ADJUSTMENT_TYPES, payrollAdjustments, payrollRuns } from "@/db/schema";
import { audit } from "@/lib/audit";
import { centsToMoney, MAX_CENTS, parseMoneyToCents } from "@/lib/salary/money";
import { formatMonth, isValidMonth } from "@/lib/time";

import { loadEmployedIn, monthBounds } from "./inputs";
import { recomputeRun, type RunResult } from "./runs";

type Db = ReturnType<typeof getDb>;

export const ADJUSTMENT_LABELS: Record<(typeof PAYROLL_ADJUSTMENT_TYPES)[number], string> = {
  bonus: "Bonus",
  advance: "Advance",
  other_addition: "Other addition",
  other_deduction: "Other deduction",
};

export const adjustmentSchema = z.object({
  employeeId: z.string().uuid("Choose an employee."),
  month: z.string().trim().refine(isValidMonth, "Choose a month."),
  type: z.enum(PAYROLL_ADJUSTMENT_TYPES, "Choose what kind of amount this is."),
  amount: z
    .string("Enter the amount in taka, like 1500.")
    .trim()
    .transform((value, ctx) => {
      const cents = parseMoneyToCents(value);
      if (cents === null || cents <= 0 || cents > MAX_CENTS) {
        ctx.addIssue({ code: "custom", message: "Enter the amount in taka, like 1500 or 1500.50. It must be more than zero." });
        return z.NEVER;
      }
      return centsToMoney(cents);
    }),
  note: z
    .string()
    .trim()
    .max(200, "Use 200 characters or fewer for the note.")
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null),
});

export type AdjustmentInput = z.input<typeof adjustmentSchema>;

const FINALIZED = "This month is finalized. Unlock it to change bonuses and advances.";

/**
 * Adds a bonus, advance or other amount for one employee in one month. The
 * employee must have been employed in that month. A finalized month is
 * refused. When the month has a draft run, its sheet is recomputed.
 */
export async function addPayrollAdjustment(
  db: Db,
  input: AdjustmentInput,
  actorId: string,
  options: { today?: string } = {},
): Promise<RunResult<{ id: string }>> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const people = await loadEmployedIn(db, data.month);
  if (!people.some((p) => p.id === data.employeeId)) {
    return { ok: false, error: `That person was not employed in ${formatMonth(data.month)}.` };
  }

  const first = monthBounds(data.month).first;
  const saved = await db.transaction(async (tx) => {
    // The run row is the lock: finalizing and changing amounts cannot overlap.
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.month, first)).for("update");
    if (run?.status === "finalized") return null;

    const [row] = await tx
      .insert(payrollAdjustments)
      .values({ employeeId: data.employeeId, month: first, type: data.type, amount: data.amount, note: data.note, createdBy: actorId })
      .returning();
    await audit(tx, { actorId, action: "payroll_adjustment.create", entity: "payroll_adjustment", entityId: row.id, after: row });
    return { row, runId: run?.id ?? null };
  });
  if (saved === null) return { ok: false, error: FINALIZED };

  if (saved.runId) await recomputeRun(db, saved.runId, actorId, options);
  return { ok: true, id: saved.row.id };
}

/** Removes an amount added by mistake. A finalized month is refused. */
export async function removePayrollAdjustment(db: Db, id: string, actorId: string, options: { today?: string } = {}): Promise<RunResult> {
  const [existing] = await db.select().from(payrollAdjustments).where(eq(payrollAdjustments.id, id));
  if (!existing) return { ok: false, error: "That amount was already removed. Reload the page." };

  const removed = await db.transaction(async (tx) => {
    const [run] = await tx.select().from(payrollRuns).where(eq(payrollRuns.month, existing.month)).for("update");
    if (run?.status === "finalized") return null;

    const [row] = await tx
      .delete(payrollAdjustments)
      .where(eq(payrollAdjustments.id, id))
      .returning();
    if (row) await audit(tx, { actorId, action: "payroll_adjustment.delete", entity: "payroll_adjustment", entityId: id, before: row });
    return { runId: run?.id ?? null };
  });
  if (removed === null) return { ok: false, error: FINALIZED };

  if (removed.runId) await recomputeRun(db, removed.runId, actorId, options);
  return { ok: true };
}
