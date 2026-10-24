import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { DEDUCTION_BASES, DIVISORS, LATE_MODES, ruleSets } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isValidMonth } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

/** More lates than this per deducted day is a typo, not a policy. */
export const MAX_LATES_PER_DAY = 31;

/** The most a fixed late deduction can be, in taka. */
export const MAX_LATE_AMOUNT = 1_000_000;

const optionalText = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "number" ? String(v) : v);

/**
 * What the owner types on the Rules screen. The month is YYYY-MM (what a month
 * field gives). The late number that does not belong to the chosen mode is
 * dropped, so a saved rule set never carries both.
 */
export const ruleSetSchema = z
  .object({
    effectiveFromMonth: z
      .string("Choose the month these rules start from.")
      .trim()
      .refine(isValidMonth, "Choose the month these rules start from."),
    lateMode: z.enum(LATE_MODES, "Choose how lates are handled."),
    lateEveryN: z.preprocess(
      optionalText,
      z
        .string()
        .trim()
        .refine((v) => v === "" || /^\d+$/.test(v), "Enter the number of lates as a whole number, like 3.")
        .transform((v) => (v === "" ? null : Number(v))),
    ),
    lateAmount: z.preprocess(
      optionalText,
      z
        .string()
        .trim()
        .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Enter the amount per late in taka, like 50 or 50.50.")
        .transform((v) => (v === "" ? null : v)),
    ),
    deductionBase: z.enum(DEDUCTION_BASES, "Choose what a day of pay is worked out from."),
    divisor: z.enum(DIVISORS, "Choose what to divide by to get a day of pay."),
    unpaidLeaveAsAbsent: z.boolean(),
  })
  .transform((data, ctx) => {
    const { lateMode, lateEveryN, lateAmount } = data;
    if (lateMode === "days_per_lates") {
      if (lateEveryN === null || lateEveryN < 1 || lateEveryN > MAX_LATES_PER_DAY) {
        ctx.addIssue({ code: "custom", message: `Enter how many lates cost one day, from 1 to ${MAX_LATES_PER_DAY}.`, path: ["lateEveryN"] });
        return z.NEVER;
      }
      return { ...data, lateAmount: null };
    }
    if (lateMode === "fixed_per_late") {
      if (lateAmount === null || Number(lateAmount) > MAX_LATE_AMOUNT) {
        ctx.addIssue({ code: "custom", message: `Enter the amount each late costs, up to ${MAX_LATE_AMOUNT.toLocaleString("en-US")} taka.`, path: ["lateAmount"] });
        return z.NEVER;
      }
      return { ...data, lateEveryN: null };
    }
    return { ...data, lateEveryN: null, lateAmount: null };
  });

export type RuleSetInput = z.input<typeof ruleSetSchema>;
export type RuleSetData = z.output<typeof ruleSetSchema>;

/** One saved rule set, with its month as YYYY-MM. */
export type RuleSetRow = {
  id: string;
  /** YYYY-MM. */
  effectiveFromMonth: string;
  lateMode: (typeof LATE_MODES)[number];
  lateEveryN: number | null;
  lateAmount: string | null;
  deductionBase: (typeof DEDUCTION_BASES)[number];
  divisor: (typeof DIVISORS)[number];
  unpaidLeaveAsAbsent: boolean;
};

function toRow(row: typeof ruleSets.$inferSelect): RuleSetRow {
  return {
    id: row.id,
    effectiveFromMonth: row.effectiveFromMonth.slice(0, 7),
    lateMode: row.lateMode,
    lateEveryN: row.lateEveryN,
    lateAmount: row.lateAmount,
    deductionBase: row.deductionBase,
    divisor: row.divisor,
    unpaidLeaveAsAbsent: row.unpaidLeaveAsAbsent,
  };
}

/** Newest start month first. */
export async function listRuleSets(db: Pick<Db, "select">): Promise<RuleSetRow[]> {
  const rows = await db.select().from(ruleSets).orderBy(desc(ruleSets.effectiveFromMonth));
  return rows.map(toRow);
}

/**
 * The rule set that applies to a month: the one with the latest start month
 * that is not after it. Null when the month is before every rule set. Pure.
 */
export function ruleSetForMonth<T extends { effectiveFromMonth: string }>(all: readonly T[], month: string): T | null {
  let best: T | null = null;
  for (const rule of all) {
    if (rule.effectiveFromMonth > month) continue;
    if (best === null || rule.effectiveFromMonth > best.effectiveFromMonth) best = rule;
  }
  return best;
}

const BASE_TEXT = { gross: "gross salary", basic: "basic salary" } as const;
const DIVISOR_TEXT = {
  thirty: "30",
  month_days: "the number of days in the month",
  working_days: "the number of working days in the month",
} as const;

/** The rules in plain sentences, for the screen and the payslip. */
export function describeRuleSet(rule: Pick<RuleSetRow, "lateMode" | "lateEveryN" | "lateAmount" | "deductionBase" | "divisor" | "unpaidLeaveAsAbsent">): string[] {
  const lines = [`A day of pay is ${BASE_TEXT[rule.deductionBase]} divided by ${DIVISOR_TEXT[rule.divisor]}.`];

  if (rule.lateMode === "days_per_lates" && rule.lateEveryN !== null) {
    lines.push(rule.lateEveryN === 1 ? "Every late costs one day of pay." : `Every ${rule.lateEveryN} lates cost one day of pay.`);
  } else if (rule.lateMode === "fixed_per_late" && rule.lateAmount !== null) {
    lines.push(`Every late costs ${Number(rule.lateAmount).toLocaleString("en-US")} taka.`);
  } else {
    lines.push("Lates are shown but cost nothing.");
  }

  lines.push(rule.unpaidLeaveAsAbsent ? "Unpaid leave days are deducted like absent days." : "Unpaid leave days are not deducted.");
  return lines;
}

/** Throws a unique violation when a rule set already starts in that month. */
export async function createRuleSet(db: Db, input: RuleSetInput, actorId: string): Promise<RuleSetRow> {
  const data = ruleSetSchema.parse(input);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(ruleSets)
      .values({ ...data, effectiveFromMonth: `${data.effectiveFromMonth}-01`, createdBy: actorId })
      .returning();
    await audit(tx, { actorId, action: "rule_set.create", entity: "rule_set", entityId: row.id, after: row });
    return toRow(row);
  });
}

/**
 * Changes a saved rule set. Its start month stays as it was: to start new rules
 * in another month, add a rule set. Returns null when it no longer exists, and
 * saving the same values writes nothing. Finalized payroll months keep their
 * own copy of the rules, so they never change.
 */
export async function updateRuleSet(db: Db, id: string, input: RuleSetInput, actorId: string) {
  const data = ruleSetSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(ruleSets).where(eq(ruleSets.id, id));
    if (!before) return null;

    const next = {
      lateMode: data.lateMode,
      lateEveryN: data.lateEveryN,
      lateAmount: data.lateAmount,
      deductionBase: data.deductionBase,
      divisor: data.divisor,
      unpaidLeaveAsAbsent: data.unpaidLeaveAsAbsent,
    };
    const unchanged =
      before.lateMode === next.lateMode &&
      before.lateEveryN === next.lateEveryN &&
      (before.lateAmount === null ? null : Number(before.lateAmount)) === (next.lateAmount === null ? null : Number(next.lateAmount)) &&
      before.deductionBase === next.deductionBase &&
      before.divisor === next.divisor &&
      before.unpaidLeaveAsAbsent === next.unpaidLeaveAsAbsent;
    if (unchanged) return { ruleSet: toRow(before), changed: false };

    const [after] = await tx.update(ruleSets).set(next).where(eq(ruleSets.id, id)).returning();
    await audit(tx, { actorId, action: "rule_set.update", entity: "rule_set", entityId: id, before, after });
    return { ruleSet: toRow(after), changed: true };
  });
}
