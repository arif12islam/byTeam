import { daysInMonth, eachDate, isValidMonth, isValidOfficeDate, nextDate, shiftMonth } from "@/lib/time";

/**
 * A stretch of office dates, first and last day both included, as YYYY-MM-DD.
 * Screens that used to show one month show a period instead, so a month, three
 * months or a custom run of days all work the same way.
 */
export type Period = { from: string; to: string };

/** The longest period a screen will work out at once. A year, with a day for leap years. */
export const MAX_PERIOD_DAYS = 366;

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** The whole of one YYYY-MM month. */
export function monthPeriod(month: string): Period {
  return { from: `${month}-01`, to: `${month}-${pad(daysInMonth(month))}` };
}

/** From the first day of one month to the last day of another, both included. */
export function monthsPeriod(firstMonth: string, lastMonth: string): Period {
  return { from: `${firstMonth}-01`, to: monthPeriod(lastMonth).to };
}

/** The date `days` after (or before, when negative) the given one. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** How many days the period covers, both ends included. */
export function periodDays(period: Period): number {
  return Math.round((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Every month the period touches, oldest first, as YYYY-MM. */
export function periodMonths(period: Period): string[] {
  const months: string[] = [];
  for (let m = period.from.slice(0, 7); m <= period.to.slice(0, 7); m = shiftMonth(m, 1)) months.push(m);
  return months;
}

/** True when the period starts on the first of a month and ends on the last day of one. */
export function isWholeMonths(period: Period): boolean {
  return period.from.endsWith("-01") && period.to === monthPeriod(period.to.slice(0, 7)).to;
}

/** The months the period covers from their first day to their last. Payroll runs are whole months, so only these count for pay. */
export function wholeMonthsIn(period: Period): string[] {
  return periodMonths(period).filter((m) => {
    const full = monthPeriod(m);
    return full.from >= period.from && full.to <= period.to;
  });
}

/** Every date of the period. */
export function periodDates(period: Period): string[] {
  return eachDate(period.from, period.to);
}

export type PresetKey = "this_month" | "last_month" | "last_3_months" | "last_6_months" | "this_year" | "last_year";

/** The quick choices, worked out from today's date. The last 3 months are this month and the two before it. */
export function presetPeriods(today: string): { key: PresetKey; label: string; period: Period }[] {
  const thisMonth = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  return [
    { key: "this_month", label: "This month", period: monthPeriod(thisMonth) },
    { key: "last_month", label: "Last month", period: monthPeriod(shiftMonth(thisMonth, -1)) },
    { key: "last_3_months", label: "Last 3 months", period: monthsPeriod(shiftMonth(thisMonth, -2), thisMonth) },
    { key: "last_6_months", label: "Last 6 months", period: monthsPeriod(shiftMonth(thisMonth, -5), thisMonth) },
    { key: "this_year", label: "This year", period: monthsPeriod(`${year}-01`, `${year}-12`) },
    { key: "last_year", label: "Last year", period: monthsPeriod(`${year - 1}-01`, `${year - 1}-12`) },
  ];
}

export type ResolvedPeriod = {
  period: Period;
  /** The matching quick choice, or "custom". */
  preset: PresetKey | "custom";
  /** Something to tell the person when their dates were changed, or null. */
  notice: string | null;
};

/**
 * Reads the period from a screen's query string. `from` and `to` pick any
 * stretch of days, `month` (the old form) picks one month, and with nothing
 * valid the period is this month. Dates the wrong way round are swapped and
 * anything over a year is cut short, with a notice saying so.
 */
export function resolvePeriod(params: { from?: unknown; to?: unknown; month?: unknown }, today: string): ResolvedPeriod {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const from = text(params.from);
  const to = text(params.to);
  const month = text(params.month);
  let notice: string | null = null;
  let period: Period;

  const fromOk = isValidOfficeDate(from);
  const toOk = isValidOfficeDate(to);
  if (fromOk && toOk) {
    period = from <= to ? { from, to } : { from: to, to: from };
    if (from > to) notice = "The dates were the wrong way round, so they were swapped.";
  } else if (fromOk) {
    period = { from, to: monthPeriod(from.slice(0, 7)).to };
  } else if (toOk) {
    period = { from: `${to.slice(0, 7)}-01`, to };
  } else if (isValidMonth(month)) {
    period = monthPeriod(month);
  } else {
    period = monthPeriod(today.slice(0, 7));
  }

  if (periodDays(period) > MAX_PERIOD_DAYS) {
    period = { from: period.from, to: addDays(period.from, MAX_PERIOD_DAYS - 1) };
    notice = "That is more than a year, so only the first year is shown. Pick a shorter stretch to see the rest.";
  }

  const match = presetPeriods(today).find((p) => p.period.from === period.from && p.period.to === period.to);
  return { period, preset: match?.key ?? "custom", notice };
}

/** The period one step back (-1) or forward (+1). Whole months move by that many months, anything else by that many days. */
export function shiftPeriod(period: Period, direction: -1 | 1): Period {
  if (isWholeMonths(period)) {
    const months = periodMonths(period).length;
    return monthsPeriod(shiftMonth(period.from.slice(0, 7), direction * months), shiftMonth(period.to.slice(0, 7), direction * months));
  }
  const days = periodDays(period);
  return { from: addDays(period.from, direction * days), to: addDays(period.to, direction * days) };
}

function shortDate(date: string, withYear: boolean): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${monthNames[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** The period for people to read: "Oct 2026", "Aug to Oct 2026", "1 to 15 Oct 2026" or "28 Sep to 5 Oct 2026". */
export function periodLabel(period: Period): string {
  const [fy, fm] = period.from.split("-").map(Number);
  const [ty, tm] = period.to.split("-").map(Number);
  if (isWholeMonths(period)) {
    const first = `${monthNames[fm - 1]}${fy === ty ? "" : ` ${fy}`}`;
    if (fy === ty && fm === tm) return `${first} ${fy}`;
    return `${first} to ${monthNames[tm - 1]} ${ty}`;
  }
  if (period.from === period.to) return shortDate(period.from, true);
  if (fy === ty && fm === tm) return `${Number(period.from.slice(8))} to ${shortDate(period.to, true)}`;
  return `${shortDate(period.from, fy !== ty)} to ${shortDate(period.to, true)}`;
}

/** The query string for a period, like "from=2026-08-01&to=2026-10-31". */
export function periodQuery(period: Period): string {
  return `from=${period.from}&to=${period.to}`;
}

/** The first date after the period. Handy for half-open ranges in queries. */
export function dayAfter(period: Period): string {
  return nextDate(period.to);
}

export type PeriodNav = {
  label: string;
  /** The current period, for filling the custom date boxes. */
  from: string;
  to: string;
  prevHref: string;
  nextHref: string;
  presets: { key: PresetKey; label: string; span: string; href: string; active: boolean }[];
};

/** Everything the date range control needs, as plain data. `basePath` is the screen the links point to. */
export function describePeriodNav(basePath: string, period: Period, today: string): PeriodNav {
  const link = (p: Period) => `${basePath}?${periodQuery(p)}`;
  return {
    label: periodLabel(period),
    from: period.from,
    to: period.to,
    prevHref: link(shiftPeriod(period, -1)),
    nextHref: link(shiftPeriod(period, 1)),
    presets: presetPeriods(today).map((p) => ({
      key: p.key,
      label: p.label,
      span: periodLabel(p.period),
      href: link(p.period),
      active: p.period.from === period.from && p.period.to === period.to,
    })),
  };
}
