import type { DeductionBase, Divisor, LateMode, PayrollAdjustmentType } from "@/db/schema";
import type { AttendanceStatus } from "@/db/schema/attendance";
import type { CalendarForLeave } from "@/lib/leave/days";
import { daysInMonth, eachDate, weekdayOf } from "@/lib/time";

/**
 * The monthly pay calculation, as plain functions. Nothing here reads the
 * database or the clock: a month's attendance, the employee's pay, the rules
 * and the bonuses and advances go in, and one item with a full breakdown comes
 * out. The same inputs always give the same item, so a draft can be rebuilt.
 *
 * Money is counted in whole paisa (integers) so no rounding error creeps in.
 * Every amount line is rounded to the paisa, half up. Only net pay is rounded
 * to a whole taka, and only at the very end.
 */

export type PayRules = {
  lateMode: LateMode;
  lateEveryN: number | null;
  /** Taka per late as text, like "50.00". */
  lateAmount: string | null;
  deductionBase: DeductionBase;
  divisor: Divisor;
  unpaidLeaveAsAbsent: boolean;
};

export type PayrollInput = {
  /** YYYY-MM. */
  month: string;
  employee: { joinDate: string; exitDate: string | null };
  /** The salary structure in force for the month, amounts as text like "30000.00". */
  salary: { gross: string; basicPct: string };
  rules: PayRules;
  /** Working days in the whole month, from `countWorkingDays`. Used when the divisor is working days. */
  workingDays: number;
  /** The employee's attendance rows for the month. Days outside the employment dates are ignored. */
  days: readonly { date: string; status: AttendanceStatus }[];
  /** Bonuses, advances and other amounts for this employee and month. Amounts are positive text. */
  adjustments: readonly { type: PayrollAdjustmentType; amount: string }[];
};

export type PayLine = {
  code: "salary" | "absent" | "unpaid_leave" | "late" | "advance" | "other_deduction" | "bonus" | "other_addition";
  label: string;
  /** Always positive. `sign` says whether it adds to or comes off pay. */
  amount: string;
  sign: "+" | "-";
};

export type PayrollBreakdown = {
  month: string;
  daysInMonth: number;
  workingDays: number;
  /** First and last day employed in the month, or null when not employed at all. */
  employedFrom: string | null;
  employedTo: string | null;
  payableDays: number;
  monthlyGross: string;
  /** The rules the item was worked out with. */
  rules: PayRules;
  /** The amount a day of pay is worked out from: gross or basic. */
  baseAmount: string;
  base: DeductionBase;
  divisor: Divisor;
  divisorDays: number;
  /** For reading only. Deductions are worked out from the base and the divisor, not from this rounded figure. */
  dailyRate: string;
  counts: {
    present: number;
    late: number;
    absent: number;
    leavePaid: number;
    leaveUnpaid: number;
    weeklyOff: number;
    holiday: number;
    /** Employed days with no attendance row. */
    missing: number;
  };
  lateDaysDeducted: number;
  lines: PayLine[];
  /** Gross earned minus deductions plus additions, before rounding to a taka. */
  netBeforeRounding: string;
  net: string;
  warnings: string[];
};

export type PayrollItem = {
  payableDays: number;
  absentDays: number;
  lateCount: number;
  unpaidLeaveDays: number;
  /** Gross earned this month: the monthly gross, pro-rated for joining or leaving mid-month. */
  gross: string;
  /** Everything taken off: absent, unpaid leave, lates, advances and other deductions. */
  deductions: string;
  /** Bonuses and other additions. */
  additions: string;
  /** Net pay in whole taka. */
  net: string;
  breakdown: PayrollBreakdown;
};

// ---------------------------------------------------------------- money

/** "1234.5" or "1234.56" as 123450 or 123456 paisa. Throws on anything else. */
export function toPaisa(amount: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new Error(`Not a money amount: "${amount}"`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** 123456 as "1234.56". Negative amounts keep their sign. */
export function fromPaisa(paisa: number): string {
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(paisa);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** a × b ÷ c, rounded half up, exact for any size of whole numbers. Needs a, b >= 0 and c >= 1. */
export function mulDivRound(a: number, b: number, c: number): number {
  const numerator = BigInt(a) * BigInt(b);
  const divisor = BigInt(c);
  const two = BigInt(2);
  return Number((numerator * two + divisor) / (divisor * two));
}

/** Rounds paisa to a whole taka (still counted in paisa). Halves go up, so 0.50 becomes 1 and -0.50 becomes 0. */
export function roundToTaka(paisa: number): number {
  return Math.floor((paisa + 50) / 100) * 100;
}

// ---------------------------------------------------------------- calendar

/**
 * Working days in a month: every date that is not a weekly off day or a
 * holiday. A holiday that falls on a weekly off day is counted once.
 */
export function countWorkingDays(month: string, calendar: CalendarForLeave): number {
  const last = daysInMonth(month);
  return eachDate(`${month}-01`, `${month}-${String(last).padStart(2, "0")}`).filter(
    (date) => !calendar.weeklyOffDays.includes(weekdayOf(date)) && !calendar.holidayDates.has(date),
  ).length;
}

// ---------------------------------------------------------------- engine

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function computePayroll(input: PayrollInput): PayrollItem {
  const { month, employee, salary, rules } = input;
  const monthDays = daysInMonth(month);
  const first = `${month}-01`;
  const last = `${month}-${String(monthDays).padStart(2, "0")}`;
  const warnings: string[] = [];

  // Days employed: joining and leaving dates are both included.
  const from = employee.joinDate > first ? employee.joinDate : first;
  const to = employee.exitDate !== null && employee.exitDate < last ? employee.exitDate : last;
  const employedDates = from <= to ? eachDate(from, to) : [];
  const payableDays = employedDates.length;

  // One status per date. If a date repeats, the last row wins.
  const statusByDate = new Map<string, AttendanceStatus>();
  for (const day of input.days) {
    if (day.date >= from && day.date <= to) statusByDate.set(day.date, day.status);
  }
  const counts = { present: 0, late: 0, absent: 0, leavePaid: 0, leaveUnpaid: 0, weeklyOff: 0, holiday: 0, missing: 0 };
  for (const date of employedDates) {
    switch (statusByDate.get(date)) {
      case "present": counts.present++; break;
      case "late": counts.late++; break;
      case "absent": counts.absent++; break;
      case "leave_paid": counts.leavePaid++; break;
      case "leave_unpaid": counts.leaveUnpaid++; break;
      case "weekly_off": counts.weeklyOff++; break;
      case "holiday": counts.holiday++; break;
      default: counts.missing++;
    }
  }
  if (counts.missing > 0) {
    warnings.push(`Attendance is missing for ${plural(counts.missing, "day")}. Those days cost nothing.`);
  }

  // What a day of pay is worked out from.
  const grossPaisa = toPaisa(salary.gross);
  const basePaisa = rules.deductionBase === "gross" ? grossPaisa : mulDivRound(grossPaisa, toPaisa(salary.basicPct), 10000);
  const divisorDays = rules.divisor === "thirty" ? 30 : rules.divisor === "month_days" ? monthDays : input.workingDays;
  const canDeduct = divisorDays >= 1;
  if (!canDeduct) warnings.push("The month has no working days, so days cannot be priced and nothing is deducted for them.");
  const dayCost = (days: number) => (canDeduct && days > 0 ? mulDivRound(basePaisa, days, divisorDays) : 0);

  // Money lines, each rounded to the paisa.
  const grossEarned = mulDivRound(grossPaisa, payableDays, monthDays);
  const absentDeduction = dayCost(counts.absent);
  const unpaidLeaveDeduction = rules.unpaidLeaveAsAbsent ? dayCost(counts.leaveUnpaid) : 0;

  let lateDaysDeducted = 0;
  let lateDeduction = 0;
  if (rules.lateMode === "days_per_lates") {
    if (rules.lateEveryN === null || rules.lateEveryN < 1) throw new Error("Rules say lates cost a day but not how many lates.");
    lateDaysDeducted = Math.floor(counts.late / rules.lateEveryN);
    lateDeduction = dayCost(lateDaysDeducted);
  } else if (rules.lateMode === "fixed_per_late") {
    if (rules.lateAmount === null) throw new Error("Rules say each late has a fixed cost but not the amount.");
    lateDeduction = toPaisa(rules.lateAmount) * counts.late;
  }

  const sum = (...types: PayrollAdjustmentType[]) =>
    input.adjustments.filter((a) => types.includes(a.type)).reduce((total, a) => total + toPaisa(a.amount), 0);
  const advances = sum("advance");
  const otherDeductions = sum("other_deduction");
  const bonuses = sum("bonus");
  const otherAdditions = sum("other_addition");

  const deductions = absentDeduction + unpaidLeaveDeduction + lateDeduction + advances + otherDeductions;
  const additions = bonuses + otherAdditions;
  const netExact = grossEarned - deductions + additions;
  const net = roundToTaka(netExact);
  if (net < 0) warnings.push("Net pay is below zero. Check the deductions and advances before finalizing.");

  // The lines a payslip shows, left out when they are zero.
  const lines: PayLine[] = [
    { code: "salary", label: `Salary for ${payableDays} of ${monthDays} days`, amount: fromPaisa(grossEarned), sign: "+" },
  ];
  const addLine = (code: PayLine["code"], label: string, paisa: number, sign: "+" | "-") => {
    if (paisa > 0) lines.push({ code, label, amount: fromPaisa(paisa), sign });
  };
  addLine("absent", `Absent, ${plural(counts.absent, "day")}`, absentDeduction, "-");
  addLine("unpaid_leave", `Unpaid leave, ${plural(counts.leaveUnpaid, "day")}`, unpaidLeaveDeduction, "-");
  addLine(
    "late",
    rules.lateMode === "days_per_lates"
      ? `Late, ${plural(counts.late, "time")} (${plural(lateDaysDeducted, "day")} deducted)`
      : `Late, ${plural(counts.late, "time")}`,
    lateDeduction,
    "-",
  );
  addLine("advance", "Advance", advances, "-");
  addLine("other_deduction", "Other deduction", otherDeductions, "-");
  addLine("bonus", "Bonus", bonuses, "+");
  addLine("other_addition", "Other addition", otherAdditions, "+");

  const breakdown: PayrollBreakdown = {
    month,
    daysInMonth: monthDays,
    workingDays: input.workingDays,
    employedFrom: payableDays > 0 ? from : null,
    employedTo: payableDays > 0 ? to : null,
    payableDays,
    monthlyGross: fromPaisa(grossPaisa),
    rules: { ...rules },
    baseAmount: fromPaisa(basePaisa),
    base: rules.deductionBase,
    divisor: rules.divisor,
    divisorDays,
    dailyRate: canDeduct ? fromPaisa(mulDivRound(basePaisa, 1, divisorDays)) : "0.00",
    counts,
    lateDaysDeducted,
    lines,
    netBeforeRounding: fromPaisa(netExact),
    net: fromPaisa(net),
    warnings,
  };

  return {
    payableDays,
    absentDays: counts.absent,
    lateCount: counts.late,
    unpaidLeaveDays: counts.leaveUnpaid,
    gross: fromPaisa(grossEarned),
    deductions: fromPaisa(deductions),
    additions: fromPaisa(additions),
    net: fromPaisa(net),
    breakdown,
  };
}
