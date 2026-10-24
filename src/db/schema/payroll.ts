import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./columns";
import { employees, users } from "./setup";

export const LATE_MODES = ["none", "days_per_lates", "fixed_per_late"] as const;
export type LateMode = (typeof LATE_MODES)[number];
export const lateMode = pgEnum("late_mode", LATE_MODES);

export const DEDUCTION_BASES = ["gross", "basic"] as const;
export type DeductionBase = (typeof DEDUCTION_BASES)[number];
export const deductionBase = pgEnum("deduction_base", DEDUCTION_BASES);

export const DIVISORS = ["thirty", "month_days", "working_days"] as const;
export type Divisor = (typeof DIVISORS)[number];
export const divisor = pgEnum("divisor", DIVISORS);

/**
 * How lates and absences turn into money. A rule set applies from its first
 * month until a later rule set takes over, so changing a rule never rewrites
 * an older month. Every month is the first day of the month.
 *
 * Late policy, by `late_mode`:
 * - none: lates are shown but cost nothing.
 * - days_per_lates: every `late_every_n` lates cost one day of pay.
 * - fixed_per_late: every late costs `late_amount`.
 */
export const ruleSets = pgTable(
  "rule_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    effectiveFromMonth: date("effective_from_month", { mode: "string" }).notNull(),
    lateMode: lateMode("late_mode").notNull().default("none"),
    lateEveryN: integer("late_every_n"),
    lateAmount: numeric("late_amount", { precision: 12, scale: 2 }),
    /** Daily pay is worked out from gross or from basic. */
    deductionBase: deductionBase("deduction_base").notNull(),
    /** Daily pay is the base divided by 30, the days in the month, or the working days in the month. */
    divisor: divisor("divisor").notNull(),
    /** Unpaid leave days are deducted like absent days. */
    unpaidLeaveAsAbsent: boolean("unpaid_leave_as_absent").notNull().default(true),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("rule_sets_effective_from_month_key").on(t.effectiveFromMonth),
    check("rule_sets_month_start", sql`extract(day from ${t.effectiveFromMonth}) = 1`),
    check("rule_sets_every_n_positive", sql`${t.lateEveryN} is null or ${t.lateEveryN} >= 1`),
    check("rule_sets_amount_not_negative", sql`${t.lateAmount} is null or ${t.lateAmount} >= 0`),
    // Each late mode needs its own number, and the other number stays empty.
    check(
      "rule_sets_late_mode_fields",
      sql`(${t.lateMode} = 'none' and ${t.lateEveryN} is null and ${t.lateAmount} is null)
        or (${t.lateMode} = 'days_per_lates' and ${t.lateEveryN} is not null and ${t.lateAmount} is null)
        or (${t.lateMode} = 'fixed_per_late' and ${t.lateAmount} is not null and ${t.lateEveryN} is null)`,
    ),
  ],
);

export const PAYROLL_RUN_STATUSES = ["draft", "finalized"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];
export const payrollRunStatus = pgEnum("payroll_run_status", PAYROLL_RUN_STATUSES);

/**
 * One payroll run per month. A draft can be recomputed freely. Finalizing it
 * copies the rule set into `rule_set_snapshot` and locks the month. Unlocking
 * returns it to draft, and finalizing again raises `version`.
 */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    month: date("month", { mode: "string" }).notNull(),
    status: payrollRunStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    ruleSetSnapshot: jsonb("rule_set_snapshot"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    finalizedBy: text("finalized_by").references(() => users.id, { onDelete: "restrict" }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("payroll_runs_month_key").on(t.month),
    check("payroll_runs_month_start", sql`extract(day from ${t.month}) = 1`),
    check("payroll_runs_version_positive", sql`${t.version} >= 1`),
    // A finalized run has its snapshot and who finalized it. A draft has none of them.
    check(
      "payroll_runs_finalize_recorded",
      sql`(${t.status} = 'draft' and ${t.ruleSetSnapshot} is null and ${t.finalizedBy} is null and ${t.finalizedAt} is null)
        or (${t.status} = 'finalized' and ${t.ruleSetSnapshot} is not null and ${t.finalizedBy} is not null and ${t.finalizedAt} is not null)`,
    ),
  ],
);

/**
 * One row per employee per run. Everything here is derived from attendance,
 * leave, salary structures, rules and adjustments, so a draft run can delete
 * and rebuild its items. `breakdown` keeps every input and step so a payslip
 * can show how net pay was reached. Net pay is a whole number of taka.
 */
export const payrollItems = pgTable(
  "payroll_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** Days employed in the month (joining and leaving mid-month shorten it). */
    payableDays: integer("payable_days").notNull(),
    absentDays: integer("absent_days").notNull().default(0),
    lateCount: integer("late_count").notNull().default(0),
    unpaidLeaveDays: integer("unpaid_leave_days").notNull().default(0),
    gross: numeric("gross", { precision: 12, scale: 2 }).notNull(),
    deductions: numeric("deductions", { precision: 12, scale: 2 }).notNull().default("0"),
    additions: numeric("additions", { precision: 12, scale: 2 }).notNull().default("0"),
    net: numeric("net", { precision: 12, scale: 2 }).notNull(),
    breakdown: jsonb("breakdown").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("payroll_items_run_employee_key").on(t.runId, t.employeeId),
    index("payroll_items_employee_idx").on(t.employeeId),
    check(
      "payroll_items_counts_not_negative",
      sql`${t.payableDays} >= 0 and ${t.absentDays} >= 0 and ${t.lateCount} >= 0 and ${t.unpaidLeaveDays} >= 0`,
    ),
    check("payroll_items_money_not_negative", sql`${t.gross} >= 0 and ${t.deductions} >= 0 and ${t.additions} >= 0`),
  ],
);

export const PAYROLL_ADJUSTMENT_TYPES = ["bonus", "advance", "other_addition", "other_deduction"] as const;
export type PayrollAdjustmentType = (typeof PAYROLL_ADJUSTMENT_TYPES)[number];
export const payrollAdjustmentType = pgEnum("payroll_adjustment_type", PAYROLL_ADJUSTMENT_TYPES);

/**
 * A bonus, advance or other amount HR adds for one employee in one month.
 * Amounts are always positive: the type says whether it is added or deducted.
 * They belong to the month, not the run, so recomputing a draft keeps them.
 */
export const payrollAdjustments = pgTable(
  "payroll_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    month: date("month", { mode: "string" }).notNull(),
    type: payrollAdjustmentType("type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("payroll_adjustments_month_idx").on(t.month, t.employeeId),
    check("payroll_adjustments_month_start", sql`extract(day from ${t.month}) = 1`),
    check("payroll_adjustments_amount_positive", sql`${t.amount} > 0`),
  ],
);
