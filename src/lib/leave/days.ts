import { eachDate, weekdayOf } from "@/lib/time";

/** One request never covers more than a year, so a typo cannot create thousands of days. */
export const MAX_LEAVE_RANGE_DAYS = 366;

export type CalendarForLeave = {
  /** 0 is Sunday, 6 is Saturday. */
  weeklyOffDays: readonly number[];
  /** Holiday dates, YYYY-MM-DD. */
  holidayDates: ReadonlySet<string>;
};

/**
 * The days a leave request really takes: every date from the first to the last
 * that is not a weekly off day or a holiday. Both ends are included. A request
 * made only of days off has none, which the caller treats as nothing to record.
 */
export function leaveWorkingDates(from: string, to: string, calendar: CalendarForLeave): string[] {
  return eachDate(from, to).filter((date) => !calendar.weeklyOffDays.includes(weekdayOf(date)) && !calendar.holidayDates.has(date));
}

/**
 * Splits a request's working dates into paid and unpaid. The unpaid days are
 * the last ones, so the leave starts as paid and runs into unpaid once the
 * balance is used up.
 */
export function splitUnpaid(workingDates: readonly string[], unpaidDays: number): { paid: string[]; unpaid: string[] } {
  const unpaidCount = Math.max(0, Math.min(unpaidDays, workingDates.length));
  const cut = workingDates.length - unpaidCount;
  return { paid: workingDates.slice(0, cut), unpaid: workingDates.slice(cut) };
}
