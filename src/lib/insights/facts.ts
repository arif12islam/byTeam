import { personDayHref, personMonthHref } from "@/lib/attendance/links";
import type { GridCell, GridRow, PeriodGrid } from "@/lib/attendance/month";
import type { Balance } from "@/lib/leave/balances";
import { describeAge, deviceStatus, type DeviceRow } from "@/lib/devices/devices";
import type { UnmatchedCode } from "@/lib/punches/unmatched";
import { formatDuration, formatMonth, formatOfficeDate, nextDate, previousDate, toOfficeDate, weekdayOf } from "@/lib/time";

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
  /** Working days absent in a row, ending on the last working day, before it is called out. */
  absentStreakDays: 2,
  /** Working days late in a row, ending on the last working day. */
  lateStreakDays: 4,
  /** Lates in the last two months, lates on one weekday, and that weekday's share of them, before a weekday pattern is said. */
  latePatternLates: 4,
  latePatternOnDay: 3,
  latePatternShare: 0.5,
  /** Absences in two months, and the share next to a day off or leave, before that pattern is said. */
  nextToOffAbsences: 3,
  nextToOffShare: 0.6,
  /** Average late minutes this month: at least this many, at least this many times last month's, with this many lates. */
  longerLatesMinutes: 30,
  longerLatesRatio: 1.5,
  longerLatesMin: 3,
  /** Days this month someone left early before it is mentioned. */
  leftEarlyDays: 3,
  /** Lates or absences last month, then working days since with none, before "back on track" is said. */
  backOnTrackBefore: 4,
  backOnTrackDays: 10,
  /** Most facts about one person on the page, so one person cannot fill it. */
  perPerson: 2,
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
  /** The person (employee id) a fact is about, so facts about one person can be limited and ordered. */
  subject?: string;
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

/** The same input without some people, as if they were not in the office: their days, their balances. Pay totals stay, since they are real. */
export function withoutPeople(input: InsightsInput, ids: ReadonlySet<string>): InsightsInput {
  if (ids.size === 0) return input;
  return {
    ...input,
    current: { ...input.current, rows: input.current.rows.filter((row) => !ids.has(row.employee.id)) },
    previous: { ...input.previous, rows: input.previous.rows.filter((row) => !ids.has(row.employee.id)) },
    balances: input.balances.filter((b) => !ids.has(b.employeeId)),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayOfMonth = (date: string) => Number(date.slice(8));
const top = <T,>(items: T[], by: (item: T) => number): T[] => [...items].sort((a, b) => by(b) - by(a)).slice(0, THRESHOLDS.perRule);

function latesUpTo(row: GridRow, throughDay: number): number {
  let lates = 0;
  for (const [date, cell] of row.cells) if (cell.status === "late" && dayOfMonth(date) <= throughDay) lates += 1;
  return lates;
}

/** Days marked absent before today. Today is left out: someone who has not punched in yet is not absent until the shift is over. */
function absentBeforeToday(row: GridRow, today: string): number {
  let days = 0;
  for (const [date, cell] of row.cells) if (cell.status === "absent" && date < today) days += 1;
  return days;
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
    text: `${row.employee.name} was late ${plural(now, "time")} so far this month, ${then === 0 ? "the first lates in a while" : `up from ${then} at this point last month`}.`,
    href: personMonthHref(row.employee.id, input.current.month),
    subject: row.employee.id,
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
    href: personMonthHref(row.employee.id, input.current.month),
    subject: row.employee.id,
    weight: row.totals.late,
  }));
}

/** Someone who keeps forgetting to punch out. Today does not count: the day is not over. */
export function forgotToPunchOut(input: InsightsInput): Fact[] {
  if (!input.trackLeavingPunch) return [];
  const found = input.current.rows.flatMap((row) => {
    const dates = [...row.cells].filter(([date, cell]) => cell.missingOut && date !== input.today).map(([date]) => date).sort();
    return dates.length >= THRESHOLDS.missingOutDays ? [{ row, days: dates.length, oldest: dates[0] }] : [];
  });
  return top(found, (f) => f.days).map(({ row, days, oldest }) => ({
    id: `forgot-out:${row.employee.id}`,
    category: "people",
    tone: "info",
    text: `${row.employee.name} has no leaving punch on ${plural(days, "day")} this month. Open the oldest to add the leaving time.`,
    href: personDayHref(row.employee.id, oldest),
    subject: row.employee.id,
    weight: days,
  }));
}

/** People who were on time on every working day, this month and last. One fact for the group. */
export function perfectAttendance(input: InsightsInput): Fact[] {
  const lastMonth = new Map(input.previous.rows.map((r) => [r.employee.id, r.totals]));
  const people = input.current.rows
    .filter((row) => {
      const before = lastMonth.get(row.employee.id);
      return (
        before !== undefined &&
        row.totals.present >= THRESHOLDS.perfectThisMonth &&
        before.present >= THRESHOLDS.perfectLastMonth &&
        absentBeforeToday(row, input.today) === 0 &&
        row.totals.late === 0 &&
        before.absent === 0 &&
        before.late === 0
      );
    })
  const names = people.map((row) => row.employee.name);
  if (names.length === 0) return [];
  const shown = names.slice(0, 3).join(", ");
  const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return [
    {
      id: "perfect-attendance",
      category: "people",
      tone: "success",
      text: `${names.length === 1 ? `${shown} was` : `${shown}${more} were`} on time every working day for two months.`,
      href: people.length === 1 ? personMonthHref(people[0].employee.id, input.current.month) : `/attendance?month=${input.current.month}`,
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
      if (cell.status === "absent" && date < input.today) {
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
      href: `/attendance?month=${input.current.month}`,
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
    subject: b.employeeId,
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
      href: `/payroll?month=${latest.month}`,
      weight: Math.abs(percent),
    },
  ];
}

// ---- Rules about one person over the last two months ----

const OFF_STATUSES = new Set<GridCell["status"]>(["weekly_off", "holiday", "leave_paid", "leave_unpaid"]);

type Day = { date: string; cell: GridCell };

/** A person's days before today, last month then this month, oldest first. Today is left out: the day is not over. */
function timeline(row: GridRow, before: GridRow | undefined, today: string): Day[] {
  const days: Day[] = [];
  for (const source of [before, row]) {
    if (!source) continue;
    for (const [date, cell] of source.cells) if (date < today) days.push({ date, cell });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/** Only the days that were a working day for the person: days off, holidays and leave neither break a streak nor count in it. */
const workingDaysOf = (days: Day[]) => days.filter((d) => !OFF_STATUSES.has(d.cell.status));

/** True when the person's record runs up to yesterday: someone who has left, or not started, has nothing to say about now. */
const recordReachesYesterday = (days: Day[], today: string) => days.at(-1)?.date === previousDate(today);

/** How many of the latest working days match, and the first date of that run. */
function trailingRun(working: Day[], matches: (cell: GridCell) => boolean): { count: number; since: string | null; wholeRecord: boolean } {
  let count = 0;
  for (let i = working.length - 1; i >= 0 && matches(working[i].cell); i -= 1) count += 1;
  return { count, since: count > 0 ? working[working.length - count].date : null, wholeRecord: count === working.length };
}

const previousRows = (input: InsightsInput) => new Map(input.previous.rows.map((r) => [r.employee.id, r]));

/** Someone absent on each of the latest working days: worth a phone call, not a report. */
export function absentStreak(input: InsightsInput): Fact[] {
  const before = previousRows(input);
  const found = input.current.rows.flatMap((row) => {
    const days = timeline(row, before.get(row.employee.id), input.today);
    if (!recordReachesYesterday(days, input.today)) return [];
    const run = trailingRun(workingDaysOf(days), (cell) => cell.status === "absent");
    return run.count >= THRESHOLDS.absentStreakDays ? [{ row, ...run }] : [];
  });
  return top(found, (f) => f.count).map(({ row, count, since, wholeRecord }) => ({
    id: `absent-streak:${row.employee.id}`,
    category: "people",
    tone: "danger",
    text: `${row.employee.name} has been absent ${wholeRecord ? "for at least " : ""}${plural(count, "working day")} in a row, since ${formatOfficeDate(since!)}. Worth a call.`,
    href: personDayHref(row.employee.id, since!),
    subject: row.employee.id,
    weight: 50 + count,
  }));
}

/** Someone late on each of the latest working days. */
export function lateStreak(input: InsightsInput): Fact[] {
  const before = previousRows(input);
  const found = input.current.rows.flatMap((row) => {
    const days = timeline(row, before.get(row.employee.id), input.today);
    if (!recordReachesYesterday(days, input.today)) return [];
    const run = trailingRun(workingDaysOf(days), (cell) => cell.status === "late");
    return run.count >= THRESHOLDS.lateStreakDays ? [{ row, count: run.count }] : [];
  });
  return top(found, (f) => f.count).map(({ row, count }) => ({
    id: `late-streak:${row.employee.id}`,
    category: "people",
    tone: "warning",
    text: `${row.employee.name} was late on each of the last ${count} working days.`,
    href: personMonthHref(row.employee.id, input.current.month),
    subject: row.employee.id,
    weight: count,
  }));
}

/** Someone who is late mostly on one weekday: often a reason behind it, such as a class or a bus that day. */
export function latePattern(input: InsightsInput): Fact[] {
  const before = previousRows(input);
  const found = input.current.rows.flatMap((row) => {
    const lates = timeline(row, before.get(row.employee.id), input.today).filter((d) => d.cell.status === "late");
    if (lates.length < THRESHOLDS.latePatternLates) return [];
    const byDay = new Array<number>(7).fill(0);
    for (const d of lates) byDay[weekdayOf(d.date)] += 1;
    const worst = byDay.indexOf(Math.max(...byDay));
    const ok = byDay[worst] >= THRESHOLDS.latePatternOnDay && byDay[worst] / lates.length >= THRESHOLDS.latePatternShare;
    return ok ? [{ row, weekday: worst, onDay: byDay[worst], total: lates.length }] : [];
  });
  return top(found, (f) => f.onDay).map(({ row, weekday, onDay, total }) => ({
    id: `late-pattern:${row.employee.id}`,
    category: "people",
    tone: "info",
    text: `${row.employee.name} is late most ${WEEKDAYS[weekday]}: ${onDay} of ${total} lates in two months.`,
    href: personMonthHref(row.employee.id, input.current.month),
    subject: row.employee.id,
    weight: onDay,
  }));
}

/** Someone whose absences keep landing next to a weekend, a holiday or leave. */
export function absenceNextToOffDays(input: InsightsInput): Fact[] {
  const before = previousRows(input);
  const found = input.current.rows.flatMap((row) => {
    const days = timeline(row, before.get(row.employee.id), input.today);
    const byDate = new Map(days.map((d) => [d.date, d.cell]));
    const absences = days.filter((d) => d.cell.status === "absent");
    if (absences.length < THRESHOLDS.nextToOffAbsences) return [];
    const next = absences.filter((d) => {
      const around = [byDate.get(previousDate(d.date)), byDate.get(nextDate(d.date))];
      return around.some((cell) => cell !== undefined && OFF_STATUSES.has(cell.status));
    }).length;
    return next / absences.length >= THRESHOLDS.nextToOffShare ? [{ row, next, total: absences.length }] : [];
  });
  return top(found, (f) => f.next).map(({ row, next, total }) => ({
    id: `absent-next-to-off:${row.employee.id}`,
    category: "people",
    tone: "info",
    text: `${row.employee.name}'s absences fall next to days off: ${next} of ${total} in two months.`,
    href: personMonthHref(row.employee.id, input.current.month),
    subject: row.employee.id,
    weight: next,
  }));
}

const averageLate = (row: GridRow) => (row.totals.late > 0 ? row.totals.lateMinutes / row.totals.late : 0);

/** Someone whose lates are not more often but longer than last month. */
export function lateMinutesUp(input: InsightsInput): Fact[] {
  const before = previousRows(input);
  const found = input.current.rows.flatMap((row) => {
    const last = before.get(row.employee.id);
    if (!last || last.totals.late === 0 || row.totals.late < THRESHOLDS.longerLatesMin) return [];
    const now = averageLate(row);
    const then = averageLate(last);
    return now >= THRESHOLDS.longerLatesMinutes && now >= then * THRESHOLDS.longerLatesRatio ? [{ row, now, then }] : [];
  });
  return top(found, (f) => f.now - f.then).map(({ row, now, then }) => ({
    id: `late-longer:${row.employee.id}`,
    category: "people",
    tone: "warning",
    text: `${row.employee.name}'s lates are getting longer: ${formatDuration(Math.round(now))} on average, up from ${formatDuration(Math.round(then))}.`,
    href: personMonthHref(row.employee.id, input.current.month),
    subject: row.employee.id,
    weight: Math.round(now - then),
  }));
}

/** Someone who keeps leaving before the shift ends. Only when the leaving punch is on. */
export function leftEarly(input: InsightsInput): Fact[] {
  if (!input.trackLeavingPunch) return [];
  const found = input.current.rows.flatMap((row) => {
    const days = [...row.cells].filter(([date, cell]) => cell.earlyMinutes > 0 && date !== input.today).length;
    return days >= THRESHOLDS.leftEarlyDays ? [{ row, days }] : [];
  });
  return top(found, (f) => f.days).map(({ row, days }) => ({
    id: `left-early:${row.employee.id}`,
    category: "people",
    tone: "info",
    text: `${row.employee.name} left early on ${plural(days, "day")} this month.`,
    href: personMonthHref(row.employee.id, input.current.month),
    subject: row.employee.id,
    weight: days,
  }));
}

/** Good news worth saying: someone who had a rough month and has been on time since. */
export function backOnTrack(input: InsightsInput): Fact[] {
  const before = previousRows(input);
  const found = input.current.rows.flatMap((row) => {
    const last = before.get(row.employee.id);
    if (!last || last.totals.late + last.totals.absent < THRESHOLDS.backOnTrackBefore) return [];
    // Counted from the start of this month, so "after a rough month" stays about the month just gone.
    const days = timeline(row, undefined, input.today);
    if (!recordReachesYesterday(days, input.today)) return [];
    const run = trailingRun(workingDaysOf(days), (cell) => cell.status === "present");
    return run.count >= THRESHOLDS.backOnTrackDays ? [{ row, count: run.count, rough: last.totals.late + last.totals.absent }] : [];
  });
  return top(found, (f) => f.count).map(({ row, count, rough }) => ({
    id: `back-on-track:${row.employee.id}`,
    category: "people",
    tone: "success",
    text: `${row.employee.name} has been on time for ${plural(count, "working day")}, after ${plural(rough, "late or absence", "lates and absences")} last month.`,
    href: personMonthHref(row.employee.id, input.current.month),
    subject: row.employee.id,
    weight: count,
  }));
}

/**
 * Facts about one person can overlap. A rule that explains more beats one it
 * contains, then no one gets more than THRESHOLDS.perPerson facts. The one
 * about pay (one late from a deduction) is always kept.
 */
const BEATS: Record<string, string[]> = {
  "absent-streak": ["absent-next-to-off"],
  "late-streak": ["lates-up", "late-pattern", "late-longer"],
  "lates-up": ["late-pattern"],
};
const ALWAYS_KEEP = new Set(["near-deduction"]);

export function limitPerPerson(ranked: readonly Fact[]): Fact[] {
  const kindsBySubject = new Map<string, Set<string>>();
  for (const fact of ranked) {
    if (!fact.subject) continue;
    const kinds = kindsBySubject.get(fact.subject) ?? new Set<string>();
    kinds.add(fact.id.split(":")[0]);
    kindsBySubject.set(fact.subject, kinds);
  }
  const kept = new Map<string, number>();
  return ranked.filter((fact) => {
    if (!fact.subject) return true;
    const kind = fact.id.split(":")[0];
    const kinds = kindsBySubject.get(fact.subject)!;
    if ([...kinds].some((other) => BEATS[other]?.includes(kind))) return false;
    if (ALWAYS_KEEP.has(kind)) return true;
    const count = kept.get(fact.subject) ?? 0;
    if (count >= THRESHOLDS.perPerson) return false;
    kept.set(fact.subject, count + 1);
    return true;
  });
}

const RULES = [
  absentStreak,
  lateStreak,
  latePattern,
  absenceNextToOffDays,
  lateMinutesUp,
  leftEarly,
  backOnTrack,
  latesUp,
  nearLateDeduction,
  forgotToPunchOut,
  perfectAttendance, worstWeekday, latesTrend,
  lowLeaveBalance,
  deviceFacts,
  unmatchedCodes,
  payrollChange,
];

const TONE_ORDER: Record<FactTone, number> = { danger: 0, warning: 1, info: 2, success: 3 };

/** Most worth reading first: problems before notes before good news, then by size. */
export function rankFacts(facts: readonly Fact[]): Fact[] {
  return [...facts].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.weight - a.weight || a.id.localeCompare(b.id));
}

export type Insights = { facts: Fact[]; byCategory: { category: FactCategory; facts: Fact[] }[] };

/** Every fact there is to say, ranked, and grouped for the Insights screen. */
export function buildInsights(input: InsightsInput): Insights {
  const facts = limitPerPerson(rankFacts(RULES.flatMap((rule) => rule(input))));
  const order: FactCategory[] = ["people", "attendance", "payroll", "office"];
  return {
    facts,
    byCategory: order.map((category) => ({ category, facts: facts.filter((f) => f.category === category) })).filter((group) => group.facts.length > 0),
  };
}

/** Facts that Today already shows as banners of their own, so the card would only repeat them. */
const SHOWN_ON_TODAY = ["device-offline:", "unmatched:"];

/** The few facts for the Today screen: what needs a look first, good news only when nothing else does. */
export function topFacts(insights: Insights, limit = 3): Fact[] {
  const worry = insights.facts.filter((f) => f.tone !== "success");
  return (worry.length > 0 ? worry : insights.facts).slice(0, limit);
}

/** The facts for the card on Today: the top few, leaving out what Today already says in its own banners. */
export function factsForToday(insights: Insights, limit = 3): Fact[] {
  return topFacts({ ...insights, facts: insights.facts.filter((f) => !SHOWN_ON_TODAY.some((prefix) => f.id.startsWith(prefix))) }, limit);
}
