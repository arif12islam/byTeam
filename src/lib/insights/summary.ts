import { personMonthHref } from "@/lib/attendance/links";
import { totalsOf, type GridRow, type PeriodGrid } from "@/lib/attendance/month";
import { describeAge, deviceStatus, type DeviceStatus } from "@/lib/devices/devices";
import { buildAttendanceReport, type DailyPoint, type DepartmentRow } from "@/lib/reports/attendance-report";
import { formatMonth, weekdayOf } from "@/lib/time";

import { THRESHOLDS, type InsightsInput } from "./facts";

/**
 * The month at a glance, worked out from the data Insights already loads: no
 * extra queries. Every function is pure. Today is never counted as absent: a
 * person who has not punched in yet is not absent until the shift is over.
 */

/** Display heuristics for what the summary shows. Not pay rules. */
export const SUMMARY = {
  /** Comparisons with last month are noise before this day of the month. */
  deltaFromDay: 3,
  /** Days attended on time, with no late or absence, before someone is listed as most on time. */
  onTimeMinDays: 5,
  /** Days left at or under which, or the share of the yearly days under which, a leave balance is shown. */
  lowLeaveDays: 2,
  lowLeaveShare: 0.15,
  /** The most people in a list. */
  listSize: 5,
  /** The most leave balances shown. */
  leaveRows: 6,
} as const;

/** The grid without today's absences: someone not in yet is not absent. Totals are worked out again. */
export function gridBeforeToday(grid: PeriodGrid, today: string): PeriodGrid {
  return {
    ...grid,
    rows: grid.rows.map((row) => {
      const cells = new Map([...row.cells].filter(([date, cell]) => !(date >= today && cell.status === "absent")));
      return { ...row, cells, totals: totalsOf(cells.values()) };
    }),
  };
}

const dayOfMonth = (date: string) => Number(date.slice(8));

/** Totals through one day of the month. */
function totalsThrough(grid: PeriodGrid, throughDay: number) {
  let present = 0;
  let late = 0;
  let absent = 0;
  for (const row of grid.rows) {
    for (const [date, cell] of row.cells) {
      if (dayOfMonth(date) > throughDay) continue;
      if (cell.status === "present" || cell.status === "late") present += 1;
      if (cell.status === "late") late += 1;
      if (cell.status === "absent") absent += 1;
    }
  }
  return { present, late, absent };
}

const rateOf = (present: number, absent: number) => (present + absent > 0 ? present / (present + absent) : null);

export type Headline = {
  /** Days attended over attended plus absent, 0 to 1, so far this month. */
  rate: number | null;
  ratePrev: number | null;
  lates: number;
  latesPrev: number;
  absences: number;
  absencesPrev: number;
  /** False early in the month, when a comparison would only be noise. */
  compare: boolean;
  today: { kind: "day-off" | "no-records" | "open"; inOffice: number; due: number; onLeave: number };
};

/** This month so far against the same days last month, and who is in today. */
export function headline(input: InsightsInput): Headline {
  const day = dayOfMonth(input.today);
  const current = totalsThrough(gridBeforeToday(input.current, input.today), day);
  const previous = totalsThrough(input.previous, day);

  let inOffice = 0;
  let notYet = 0;
  let onLeave = 0;
  let cells = 0;
  let offCells = 0;
  for (const row of input.current.rows) {
    const cell = row.cells.get(input.today);
    if (!cell) continue;
    cells += 1;
    if (cell.status === "present" || cell.status === "late") inOffice += 1;
    else if (cell.status === "absent") notYet += 1;
    else if (cell.status === "leave_paid" || cell.status === "leave_unpaid") onLeave += 1;
    else offCells += 1;
  }

  return {
    rate: rateOf(current.present, current.absent),
    ratePrev: rateOf(previous.present, previous.absent),
    lates: current.late,
    latesPrev: previous.late,
    absences: current.absent,
    absencesPrev: previous.absent,
    compare: day >= SUMMARY.deltaFromDay,
    today: {
      kind: cells === 0 ? "no-records" : offCells === cells ? "day-off" : "open",
      inOffice,
      due: inOffice + notYet,
      onLeave,
    },
  };
}

/** "2 more than at this point last month", "the same as ...", or null when not worth saying. */
export function deltaText(now: number, then: number, compare: boolean): string | null {
  if (!compare) return null;
  if (now === then) return "The same as at this point last month";
  const diff = Math.abs(now - then);
  return `${diff} ${now > then ? "more" : "fewer"} than at this point last month`;
}

/** Each day of the month so far: on time, late, absent (before today) and on leave. */
export function dailyPoints(input: InsightsInput): DailyPoint[] {
  return buildAttendanceReport(gridBeforeToday(input.current, input.today)).daily;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type WeekdayLates = { weekday: number; label: string; lates: number };

/** Lates on each working weekday over this month and last, so a pattern has enough to show. */
export function latesByWeekday(input: InsightsInput): WeekdayLates[] {
  const lates = new Array<number>(7).fill(0);
  const worked = new Array<boolean>(7).fill(false);
  for (const grid of [input.previous, input.current]) {
    for (const row of grid.rows) {
      for (const [date, cell] of row.cells) {
        if (date >= input.today) continue;
        const weekday = weekdayOf(date);
        if (cell.status !== "weekly_off" && cell.status !== "holiday") worked[weekday] = true;
        if (cell.status === "late") lates[weekday] += 1;
      }
    }
  }
  const rows = WEEKDAY_SHORT.map((label, weekday) => ({ weekday, label, lates: lates[weekday] })).filter((r) => worked[r.weekday]);
  return rows.some((r) => r.lates > 0) ? rows : [];
}

export type PersonLine = { id: string; name: string; present: number; late: number; absent: number; href: string };

function line(row: GridRow, month: string): PersonLine {
  return {
    id: row.employee.id,
    name: row.employee.name,
    present: row.totals.present,
    late: row.totals.late,
    absent: row.totals.absent,
    href: personMonthHref(row.employee.id, month),
  };
}

/** Who was on time every day so far, and who needs a look (the most lates and absences). */
export function people(input: InsightsInput): { onTime: PersonLine[]; needsLook: PersonLine[] } {
  const grid = gridBeforeToday(input.current, input.today);
  const lines = grid.rows.map((row) => line(row, grid.month));
  const onTime = lines
    .filter((p) => p.late === 0 && p.absent === 0 && p.present >= SUMMARY.onTimeMinDays)
    .sort((a, b) => b.present - a.present || a.name.localeCompare(b.name))
    .slice(0, SUMMARY.listSize);
  const needsLook = lines
    .filter((p) => p.late + p.absent > 0)
    .sort((a, b) => b.absent * 2 + b.late - (a.absent * 2 + a.late) || a.name.localeCompare(b.name))
    .slice(0, SUMMARY.listSize);
  return { onTime, needsLook };
}

export type LeaveLow = { employeeId: string; name: string; type: string; remaining: number; quota: number };

/** Leave balances that are nearly used up, the lowest first. */
export function leaveLow(input: InsightsInput): LeaveLow[] {
  return input.balances
    .flatMap((b) =>
      b.quota !== null && b.quota > 0 && b.remaining !== null && b.remaining >= 0 && (b.remaining <= SUMMARY.lowLeaveDays || b.remaining / b.quota < SUMMARY.lowLeaveShare)
        ? [{ employeeId: b.employeeId, name: b.employeeName, type: b.leaveTypeName, remaining: b.remaining, quota: b.quota }]
        : [],
    )
    .sort((a, b) => a.remaining / a.quota - b.remaining / b.quota || a.name.localeCompare(b.name))
    .slice(0, SUMMARY.leaveRows);
}

export type DeviceLine = { id: string; name: string; status: DeviceStatus; lastSeen: string | null; driftSeconds: number | null };

/** Each device's last contact and clock, and how many unlinked codes punched lately. */
export function deviceHealth(input: InsightsInput): { devices: DeviceLine[]; unknownCodes: number } {
  const cutoff = new Date(input.now.getTime() - THRESHOLDS.unmatchedDays * 24 * 60 * 60 * 1000);
  return {
    devices: input.devices
      .filter((d) => d.active)
      .map((d) => ({
        id: d.id,
        name: d.name,
        status: deviceStatus(d.lastSeenAt, input.now),
        lastSeen: describeAge(d.lastSeenAt, input.now),
        driftSeconds: d.clockOffsetSeconds,
      })),
    unknownCodes: input.unmatched.filter((code) => code.lastPunchAt >= cutoff).length,
  };
}

/** Attendance by department, or null unless there are two or more real departments to compare. */
export function departments(input: InsightsInput): DepartmentRow[] | null {
  const rows = buildAttendanceReport(gridBeforeToday(input.current, input.today)).departments.filter((d) => d.department !== "No department");
  return rows.length >= 2 ? rows : null;
}

export type PayrollTrend = { months: { month: string; label: string; net: number; people: number }[]; changePercent: number | null };

/** Net pay of the latest payroll runs, oldest first, and the change in the newest. Empty with fewer than two runs. */
export function payrollTrend(input: InsightsInput): PayrollTrend {
  if (input.payroll.length < 2) return { months: [], changePercent: null };
  const months = input.payroll.slice(0, 3).map((p) => ({ month: p.month, label: formatMonth(p.month), net: p.net, people: p.people })).reverse();
  const [latest, before] = input.payroll;
  return { months, changePercent: before.net > 0 ? ((latest.net - before.net) / before.net) * 100 : null };
}

export type InsightsSummary = {
  month: string;
  headline: Headline;
  daily: DailyPoint[];
  weekdays: WeekdayLates[];
  people: ReturnType<typeof people>;
  leaveLow: LeaveLow[];
  devices: ReturnType<typeof deviceHealth>;
  departments: DepartmentRow[] | null;
  payroll: PayrollTrend;
};

export function buildSummary(input: InsightsInput): InsightsSummary {
  return {
    month: input.current.month,
    headline: headline(input),
    daily: dailyPoints(input),
    weekdays: latesByWeekday(input),
    people: people(input),
    leaveLow: leaveLow(input),
    devices: deviceHealth(input),
    departments: departments(input),
    payroll: payrollTrend(input),
  };
}

