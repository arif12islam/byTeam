import { and, between, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";

import type { getDb } from "@/db";
import { attendanceDays, employees, holidays, payrollAdjustments, salaryStructures } from "@/db/schema";
import { getCompanySettings } from "@/lib/settings/company";
import { daysInMonth, nextDate } from "@/lib/time";

import { computePayroll, countWorkingDays, type PayRules, type PayrollItem } from "./compute";
import { listRuleSets, ruleSetForMonth, type RuleSetRow } from "./rules";

type Db = ReturnType<typeof getDb>;
type Reader = Pick<Db, "select">;

export type PayrollEmployee = {
  id: string;
  empCode: string;
  name: string;
  department: string | null;
  joinDate: string;
  exitDate: string | null;
};

export type PayrollEntry = {
  employee: PayrollEmployee;
  /** The salary structure in force for the month, or null when none is set. */
  salary: { gross: string; basicPct: string } | null;
  days: { date: string; status: (typeof attendanceDays.$inferSelect)["status"] }[];
  adjustments: { type: (typeof payrollAdjustments.$inferSelect)["type"]; amount: string }[];
};

export type PayrollInputs = {
  /** YYYY-MM. */
  month: string;
  /** The rule set in force for the month, or null when no rules start on or before it. */
  ruleSet: RuleSetRow | null;
  weeklyOffDays: number[];
  workingDays: number;
  entries: PayrollEntry[];
};

export function monthBounds(month: string): { first: string; last: string } {
  return { first: `${month}-01`, last: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}

/** The rule set's pay fields, for `computePayroll`. */
export function payRulesOf(rule: RuleSetRow): PayRules {
  return {
    lateMode: rule.lateMode,
    lateEveryN: rule.lateEveryN,
    lateAmount: rule.lateAmount,
    deductionBase: rule.deductionBase,
    divisor: rule.divisor,
    unpaidLeaveAsAbsent: rule.unpaidLeaveAsAbsent,
  };
}

/** Everyone who was employed on at least one day of the month. People marked inactive with no exit date are left out: nobody knows when they left. */
export async function loadEmployedIn(db: Reader, month: string): Promise<PayrollEmployee[]> {
  const { first, last } = monthBounds(month);
  const rows = await db
    .select({
      id: employees.id,
      empCode: employees.empCode,
      name: employees.name,
      department: employees.department,
      joinDate: employees.joinDate,
      exitDate: employees.exitDate,
      active: employees.active,
    })
    .from(employees)
    .where(and(lt(employees.joinDate, nextDate(last)), or(isNull(employees.exitDate), gte(employees.exitDate, first))));
  return rows
    .filter((r) => r.active || r.exitDate !== null)
    .map(({ id, empCode, name, department, joinDate, exitDate }) => ({ id, empCode, name, department, joinDate, exitDate }))
    .sort((a, b) => a.empCode.localeCompare(b.empCode, undefined, { numeric: true }));
}

/**
 * Everything the month's pay depends on, read from stored data: the people,
 * their salary structures, stored attendance days, bonuses and advances, the
 * rules and the calendar. Saves nothing. Attendance is read as stored, so the
 * caller recalculates the month first when it needs the latest.
 */
export async function loadPayrollInputs(db: Reader, month: string): Promise<PayrollInputs> {
  const { first, last } = monthBounds(month);
  const people = await loadEmployedIn(db, month);
  const ids = people.map((p) => p.id);

  const [rules, settings, holidayRows] = await Promise.all([
    listRuleSets(db),
    getCompanySettings(db),
    db.select({ date: holidays.date }).from(holidays).where(between(holidays.date, first, last)),
  ]);
  const workingDays = countWorkingDays(month, {
    weeklyOffDays: settings.weeklyOffDays,
    holidayDates: new Set(holidayRows.map((h) => h.date)),
  });

  const [structures, dayRows, adjustmentRows] =
    ids.length === 0
      ? [[], [], []]
      : await Promise.all([
          db.select().from(salaryStructures).where(inArray(salaryStructures.employeeId, ids)),
          db
            .select({ employeeId: attendanceDays.employeeId, date: attendanceDays.date, status: attendanceDays.status })
            .from(attendanceDays)
            .where(and(inArray(attendanceDays.employeeId, ids), between(attendanceDays.date, first, last))),
          db
            .select({ employeeId: payrollAdjustments.employeeId, type: payrollAdjustments.type, amount: payrollAdjustments.amount })
            .from(payrollAdjustments)
            .where(and(inArray(payrollAdjustments.employeeId, ids), eq(payrollAdjustments.month, first))),
        ]);

  // The structure in force: the latest one starting on or before the month.
  const structureByEmployee = new Map<string, (typeof structures)[number]>();
  for (const s of structures) {
    if (s.effectiveFrom > first) continue;
    const best = structureByEmployee.get(s.employeeId);
    if (!best || s.effectiveFrom > best.effectiveFrom) structureByEmployee.set(s.employeeId, s);
  }

  const group = <T extends { employeeId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) map.set(row.employeeId, [...(map.get(row.employeeId) ?? []), row]);
    return map;
  };
  const daysByEmployee = group(dayRows);
  const adjustmentsByEmployee = group(adjustmentRows);

  return {
    month,
    ruleSet: ruleSetForMonth(rules, month.slice(0, 7)),
    weeklyOffDays: settings.weeklyOffDays,
    workingDays,
    entries: people.map((employee) => {
      const structure = structureByEmployee.get(employee.id);
      return {
        employee,
        salary: structure ? { gross: structure.gross, basicPct: structure.basicPct } : null,
        days: (daysByEmployee.get(employee.id) ?? []).map(({ date, status }) => ({ date, status })),
        adjustments: (adjustmentsByEmployee.get(employee.id) ?? []).map(({ type, amount }) => ({ type, amount })),
      };
    }),
  };
}

export type BuiltItem = { employee: PayrollEmployee; item: PayrollItem };
export type SkippedEmployee = { employee: PayrollEmployee; reason: "no_salary" };

/**
 * Works out one item per employee who has a salary structure. People with
 * none are returned in `skipped` so the screen can say who is not being paid.
 * Pure: the same inputs always give the same items.
 */
export function buildPayrollItems(inputs: PayrollInputs): { items: BuiltItem[]; skipped: SkippedEmployee[] } {
  if (inputs.ruleSet === null) throw new Error("No pay rules apply to this month.");
  const rules = payRulesOf(inputs.ruleSet);

  const items: BuiltItem[] = [];
  const skipped: SkippedEmployee[] = [];
  for (const entry of inputs.entries) {
    if (entry.salary === null) {
      skipped.push({ employee: entry.employee, reason: "no_salary" });
      continue;
    }
    items.push({
      employee: entry.employee,
      item: computePayroll({
        month: inputs.month,
        employee: { joinDate: entry.employee.joinDate, exitDate: entry.employee.exitDate },
        salary: entry.salary,
        rules,
        workingDays: inputs.workingDays,
        days: entry.days,
        adjustments: entry.adjustments,
      }),
    });
  }
  return { items, skipped };
}
