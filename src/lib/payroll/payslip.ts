import { and, eq } from "drizzle-orm";

import type { getDb } from "@/db";
import { companySettings, employees, payrollItems, payrollRuns, users } from "@/db/schema";
import { formatMonth, toOfficeDate } from "@/lib/time";

import type { PayLine, PayrollBreakdown } from "./compute";
import { monthBounds } from "./inputs";

type Db = ReturnType<typeof getDb>;

/** Everything a payslip shows, read from the finalized item so it never drifts from what was approved. */
export type Payslip = {
  company: string;
  /** YYYY-MM. */
  month: string;
  version: number;
  /** Office date the month was finalized, YYYY-MM-DD. */
  finalizedOn: string;
  employee: { name: string; empCode: string; department: string | null; designation: string | null };
  /** Days in the month, days paid, and the counts the pay depends on. */
  days: { inMonth: number; paid: number; absent: number; late: number; unpaidLeave: number };
  lines: PayLine[];
  /** Net pay in whole taka, like "28571.00". */
  net: string;
};

type ItemRow = typeof payrollItems.$inferSelect;

/** A payslip from one stored item. Pure. */
export function buildPayslip(input: {
  company: string;
  month: string;
  version: number;
  finalizedOn: string;
  employee: Payslip["employee"];
  item: Pick<ItemRow, "payableDays" | "absentDays" | "lateCount" | "unpaidLeaveDays" | "net" | "breakdown">;
}): Payslip {
  const breakdown = input.item.breakdown as PayrollBreakdown;
  return {
    company: input.company,
    month: input.month,
    version: input.version,
    finalizedOn: input.finalizedOn,
    employee: input.employee,
    days: {
      inMonth: breakdown.daysInMonth,
      paid: input.item.payableDays,
      absent: input.item.absentDays,
      late: input.item.lateCount,
      unpaidLeave: input.item.unpaidLeaveDays,
    },
    lines: breakdown.lines,
    net: input.item.net,
  };
}

export type PayslipsResult = { ok: true; slips: Payslip[] } | { ok: false; error: string; status: 404 | 409 };

/**
 * The payslips of a finalized month: one employee's, or everyone's when no
 * employee is given. Drafts have none, because a payslip must match the
 * numbers the owner approved.
 */
export async function loadPayslips(db: Pick<Db, "select">, month: string, employeeId?: string): Promise<PayslipsResult> {
  const [found] = await db
    .select({ run: payrollRuns, finalizedBy: users.name })
    .from(payrollRuns)
    .leftJoin(users, eq(users.id, payrollRuns.finalizedBy))
    .where(eq(payrollRuns.month, monthBounds(month).first));
  if (!found) return { ok: false, error: `There is no payroll run for ${formatMonth(month)}.`, status: 404 };
  const { run } = found;
  if (run.status !== "finalized" || run.finalizedAt === null) {
    return { ok: false, error: `${formatMonth(month)} is still a draft. Finalize it to get payslips.`, status: 409 };
  }

  const [settings] = await db.select({ name: companySettings.name }).from(companySettings).where(eq(companySettings.id, 1));
  const rows = await db
    .select({ item: payrollItems, employee: employees })
    .from(payrollItems)
    .innerJoin(employees, eq(employees.id, payrollItems.employeeId))
    .where(employeeId ? and(eq(payrollItems.runId, run.id), eq(payrollItems.employeeId, employeeId)) : eq(payrollItems.runId, run.id));
  if (rows.length === 0) {
    return { ok: false, error: employeeId ? `That person has no payslip for ${formatMonth(month)}.` : `${formatMonth(month)} has no payslips.`, status: 404 };
  }

  const slips = rows
    .sort((a, b) => a.employee.empCode.localeCompare(b.employee.empCode, undefined, { numeric: true }))
    .map(({ item, employee }) =>
      buildPayslip({
        company: settings?.name ?? "",
        month,
        version: run.version,
        finalizedOn: toOfficeDate(run.finalizedAt!),
        employee: { name: employee.name, empCode: employee.empCode, department: employee.department, designation: employee.designation },
        item,
      }),
    );
  return { ok: true, slips };
}
