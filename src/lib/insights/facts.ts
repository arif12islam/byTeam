import type { Balance } from "@/lib/leave/balances";
import type { GridRow, PeriodGrid } from "@/lib/attendance/month";
import { describeAge, deviceStatus, type DeviceRow } from "@/lib/devices/devices";
import type { UnmatchedCode } from "@/lib/punches/unmatched";
import { formatDuration, formatMonth, toOfficeDate, weekdayOf } from "@/lib/time";

/**
 * Smart facts: short plain sentences worked out from what byTeam already
 * stores, so nothing new has to be entered. Every rule is a small pure
 * function over data that is already loaded, so each can be tested alone.
 * src/lib/insights/load.ts loads the data.
 *
 * The numbers below decide when a fact is worth saying. They are for
 * choosing what to show, not for pay: pay rules live in rule_sets.
 */
export const THRESHOLDS = {
  /** A person has to be this many lates worse than the same point last month. */
  latesUpBy: 3,
  /** Days without a leaving punch before it is worth mentioning. */
  missingOutDays: 3,
  /** Working days present, this month and last, before "on time for two months" is said. */
  perfectThisMonth: 5,
  perfectLastMonth: 10,
  /** Absences in the month, and the share on one weekday, before a weekday is called out. */
  worstWeekdayAbsences: 4,
  worstWeekdayShare: 0.4,
  /** Lates so far this month, and how much worse or better than last month, before the office trend is said. */
  trendMinLates: 5,
  trendRatio: 1.3,
  /** Not before this day of the month: earlier comparisons are noise. */
  trendFromDay: 8,
  /** Net pay change, in percent, before it is mentioned. */
  payrollChangePercent: 3,
  clockDriftSeconds: 120,
  /** Days left of a leave type with a yearly limit before it is mentioned. */
  lowBalanceDays: 1,
  /** An unlinked code that punched this recently is mentioned. */
  unmatchedDays: 14,
  /** The most facts one rule gives, so one problem cannot fill the page. */
  perRule: 5,
} as const;

export type FactTone = "danger" | "warning" | "info" | "success";
export type FactCategory = "people" | "attendance" | "payroll" | "office";

export type Fact = {
  id: string;
  category: FactCategory;
  tone: FactTone;
  text: string;
  /** Where tapping it goes. */
  href: string | null;
  /** Orders facts of the same tone: bigger is more worth reading. */
  weight: number;
};

export const CATEGORY_LABELS: Record<FactCategory, string> = {
  people: "People",
  attendance: "Attendance",
  payroll: "Payroll",
  office: "Device and data",
};

export type InsightsInput = {
  /** The office date. */
  today: string;
  now: Date;
  /** The whole of this month. Days after today have no cell. */
  current: PeriodGrid;
  /** The whole of last month. */
  previous: PeriodGrid;
  trackLeavingPunch: boolean;
  /** The late rule in force this month, or null when there is none. */
  lateRule: { lateMode: "none" | "days_per_lates" | "fixed_per_late"; lateEveryN: number | null } | null;
  /** Leave balances this year, with the names to say. */
  balances: readonly (Pick<Balance, "employeeId" | "quota" | "remaining"> & { employeeName: string; leaveTypeName: string })[];
  devices: readonly DeviceRow[];
  /** True while the office is open today, so a quiet device is worth mentioning. */
  officeOpen: boolean;
  unmatched: readonly UnmatchedCode[];
  /** Net pay of the two most recent months that have a payroll run: newest first. */
  payroll: readonly { month: string; net: number; people: number }[];
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayOfMonth = (date: string) => Number(date.slice(8));
const top = <T,>(items: T[], by: (item: T) => number): T[] => [...items].sort((a, b) => by(b) - by(a)).slice(0, THRESHOLDS.perRule);

function latesUpTo(row: GridRow, throughDay: number): number {
  let lates = 0;
  for (const [date, cell] of row.cells) if (cell.status === "late" && dayOfMonth(date) <= throughDay) lates += 1;
  return lates;
}

/** Someone's lates this month against the same days last month. */
export function latesUp(input: InsightsInput): Fact[] {
  const day = dayOfMonth(input.today);
  const lastMonth = new Map(input.previous.rows.map((r) => [r.employee.id, r]));
  const found = input.current.rows.flatMap((row) => {
    const now = row.totals.late;
    const then = lastMonth.has(row.employee.id) ? latesUpTo(lastMonth.get(row.employee.id)!, day) : 0;
    return now - then >= THRESHOLDS.latesUpBy ? [{ row, now, then }] : [];
  });
  return top(found, (f) => f.now - f.then).map(({ row, now, then }) => ({
    id: `lates-up:${row.employee.id}`,
    category: "people",
    tone: "warning",
    text: `${row.employee.name} was late ${plural(now, "time")} so far this month, up from ${then} at this point last month.`,
    href: `/employees/${row.employee.id}`,
    weight: now - then,
  }));
}

/** Someone one late away from the rule that turns lates into a day of pay. */
export function nearLateDeduction(input: InsightsInput): Fact[] {
  const rule = input.lateRule;
  if (!rule || rule.lateMode !== "days_per_lates" || !rule.lateEveryN || rule.lateEveryN < 2) return [];
  const every = rule.lateEveryN;
  const found = input.current.rows.filter((row) => row.totals.late > 0 && row.totals.late % every === every - 1);
  return top(found, (row) => row.totals.late).map((row) => ({
    id: `near-deduction:${row.employee.id}`,
    category: "people",
    tone: "warning",
    text: `${row.employee.name} has ${plural(row.totals.late, "late")} this month. One more costs a day of pay.`,
    href: `/employees/${row.employee.id}`,
    weight: row.totals.late,
  }));
}

/** Someone who keeps forgetting to punch out. Today does not count: the day is not over. */
export function forgotToPunchOut(input: InsightsInput): Fact[] {
  if (!input.trackLeavingPunch) return [];
  const found = input.current.rows.flatMap((row) => {
    let days = 0;
    for (const [date, cell] of row.cells) if (cell.missingOut && date !== input.today) days += 1;
    return days >= THRESHOLDS.missingOutDays ? [{ row, days }] : [];
  });
  return top(found, (f) => f.days).map(({ row, days }) => ({
    id: `forgot-out:${row.employee.id}`,
    category: "people",
    tone: "info",
    text: `${row.employee.name} has no leaving punch on ${plural(days, "day")} this month.`,
    href: `/employees/${row.employee.id}`,
    weight: days,
  }));
}

/** People who were on time on every working day, this month and last. One fact for the group. */
export function perfectAttendance(input: InsightsInput): Fact[] {
  const lastMonth = new Map(input.previous.rows.map((r) => [r.employee.id, r.totals]));
  const names = input.current.rows
    .filter((row) => {
      const before = lastMonth.get(row.employee.id);
      return (
        before !== undefined &&
        row.totals.present >= THRESHOLDS.perfectThisMonth &&
        before.present >= THRESHOLDS.perfectLastMonth &&
        row.totals.absent === 0 &&
        row.totals.late === 0 &&
        before.absent === 0 &&
        before.late === 0
      );
    })
    .map((row) => row.employee.name);
  if (names.length === 0) return [];
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return [
    {
      id: "perfect-attendance",
      category: "people",
      tone: "success",
      text: `${names.length === 1 ? `${shown} was` : `${shown}${more} were`} on time every working day for two months.`,
      href: "/attendance",
      weight: names.length,
    },
  ];
}

const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** The weekday that has most of this month's absences, when it clearly stands out. */
export function worstWeekday(input: InsightsInput): Fact[] {
  const byDay = new Array<number>(7).fill(0);
  let total = 0;
  for (const row of input.current.rows) {
    for (const [date, cell] of row.cells) {
      if (cell.status === "absent") {
        byDay[weekdayOf(date)] += 1;
        total += 1;
      }
    }
  }
  if (total < THRESHOLDS.worstWeekdayAbsences) return [];
  const worst = byDay.indexOf(Math.max(...byDay));
  if (byDay[worst] / total < THRESHOLDS.worstWeekdayShare) return [];
  return [
    {
      id: "worst-weekday",
      category: "attendance",
      tone: "info",
      text: `${WEEKDAYS[worst]} have the most absences this month: ${byDay[worst]} of ${total}.`,
      href: "/attendance",
      weight: byDay[worst],
    },
  ];
}

/** Lates across the office so far this month against the same days last month. */
export function latesTrend(input: InsightsInput): Fact[] {
  const day = dayOfMonth(input.today);
  if (day < THRESHOLDS.trendFromDay) return [];
  const now = input.current.rows.reduce((sum, row) => sum + row.totals.late, 0);
  const then = input.previous.rows.reduce((sum, row) => sum + latesUpTo(row, day), 0);

  if (now >= THRESHOLDS.trendMinLates && now >= then * THRESHOLDS.trendRatio && now > then) {
    return [{ id: "lates-trend", category: "attendance", tone: "warning", text: `Lates are up: ${now} so far this month, against ${then} at this point last month.`, href: "/reports", weight: now - then }];
  }
  if (then >= THRESHOLDS.trendMinLates && now * THRESHOLDS.trendRatio <= then) {
    return [{ id: "lates-trend", category: "attendance", tone: "success", text: `Lates are down: ${now} so far this month, against ${then} at this point last month.`, href: "/reports", weight: then - now }];
  }
  return [];
}

/** People close to running out of a leave type that has a yearly limit. */
export function lowLeaveBalance(input: InsightsInput): Fact[] {
  const found = input.balances.filter((b) => b.quota !== null && b.quota > 0 && b.remaining !== null && b.remaining >= 0 && b.remaining <= THRESHOLDS.lowBalanceDays);
  return top(found, (b) => b.quota! - b.remaining!).map((b) => ({
    id: `low-leave:${b.employeeId}:${b.leaveTypeName}`,
    category: "people",
    tone: "info",
    text: `${b.employeeName} has ${b.remaining === 0 ? "no days" : "1 day"} of ${b.leaveTypeName} left this year.`,
    href: "/leave",
    weight: b.quota! - b.remaining!,
  }));
}

/** A device that has gone quiet in office hours, and a clock that is off. */
export function deviceFacts(input: InsightsInput): Fact[] {
  const facts: Fact[] = [];
  for (const device of input.devices) {
    if (!device.active) continue;
    if (input.officeOpen && deviceStatus(device.lastSeenAt, input.now) === "offline") {
      facts.push({
        id: `device-offline:${device.serialNo}`,
        category: "office",
        tone: "danger",
        text: `${device.name} was last heard from ${describeAge(device.lastSeenAt, input.now) ?? "a while ago"}. Check its power and the office laptop.`,
        href: "/devices",
        weight: 100,
      });
    }
    const drift = device.clockOffsetSeconds;
    if (drift !== null && Math.abs(drift) >= THRESHOLDS.clockDriftSeconds) {
      facts.push({
        id: `device-clock:${device.serialNo}`,
        category: "office",
        tone: "warning",
        text: `${device.name}'s clock is ${formatDuration(Math.round(Math.abs(drift) / 60))} ${drift > 0 ? "fast" : "slow"}, so punch times may be off.`,
        href: "/devices",
        weight: Math.abs(drift) / 60,
      });
    }
  }
  return facts;
}

/** Codes that punched in the last two weeks but belong to nobody. */
export function unmatchedCodes(input: InsightsInput): Fact[] {
  const cutoff = new Date(input.now.getTime() - THRESHOLDS.unmatchedDays * 24 * 60 * 60 * 1000);
  const found = input.unmatched.filter((code) => code.lastPunchAt >= cutoff);
  return top(found, (code) => code.punches).map((code) => ({
    id: `unmatched:${code.empCode}`,
    category: "office",
    tone: "warning",
    text: `Code ${code.empCode} punched ${plural(code.punches, "time")} but is not linked to anyone${toOfficeDate(code.lastPunchAt) === input.today ? ", today" : ""}.`,
    href: `/employees/new?code=${encodeURIComponent(code.empCode)}`,
    weight: code.punches,
  }));
}

/** The change in net pay between the two most recent months with a payroll run. */
export function payrollChange(input: InsightsInput): Fact[] {
  const [latest, before] = input.payroll;
  if (!latest || !before || before.net <= 0) return [];
  const percent = ((latest.net - before.net) / before.net) * 100;
  if (Math.abs(percent) < THRESHOLDS.payrollChangePercent) return [];

  const people = latest.people - before.people;
  const peopleNote = people === 0 ? "" : `, with ${Math.abs(people)} ${people > 0 ? "more" : "fewer"} ${Math.abs(people) === 1 ? "person" : "people"} paid`;
  return [
    {
      id: "payroll-change",
      category: "payroll",
      tone: "info",
      text: `Net pay for ${formatMonth(latest.month)} was ${Math.round(Math.abs(percent))}% ${percent > 0 ? "higher" : "lower"} than ${formatMonth(before.month)}${peopleNote}.`,
      href: "/payroll",
      weight: Math.abs(percent),
    },
  ];
}

const RULES = [latesUp, nearLateDeduction, forgotToPunchOut, perfectAttendance, worstWeekday, latesTrend, lowLeaveBalance, deviceFacts, unmatchedCodes, payrollChange];

const TONE_ORDER: Record<FactTone, number> = { danger: 0, warning: 1, info: 2, success: 3 };

/** Most worth reading first: problems before notes before good news, then by size. */
export function rankFacts(facts: readonly Fact[]): Fact[] {
  return [...facts].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.weight - a.weight || a.id.localeCompare(b.id));
}

export type Insights = { facts: Fact[]; byCategory: { category: FactCategory; facts: Fact[] }[] };

/** Every fact there is to say, ranked, and grouped for the Insights screen. */
export function buildInsights(input: InsightsInput): Insights {
  const facts = rankFacts(RULES.flatMap((rule) => rule(input)));
  const order: FactCategory[] = ["people", "attendance", "payroll", "office"];
  return {
    facts,
    byCategory: order.map((category) => ({ category, facts: facts.filter((f) => f.category === category) })).filter((group) => group.facts.length > 0),
  };
}

/** The few facts for the Today screen: what needs a look first, good news only when nothing else does. */
export function topFacts(insights: Insights, limit = 3): Fact[] {
  const worry = insights.facts.filter((f) => f.tone !== "success");
  return (worry.length > 0 ? worry : insights.facts).slice(0, limit);
}
