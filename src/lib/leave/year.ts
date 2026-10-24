import type { LeaveYearBasis } from "@/db/schema";
import { nextDate, previousDate } from "@/lib/time";

export type LeaveYear = { from: string; to: string };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The date a person's k-th work anniversary falls on. Someone who joined on 29
 * February has it on 28 February in years that are not leap years.
 */
export function anniversary(joinDate: string, years: number): string {
  const [y, m, d] = joinDate.split("-").map(Number);
  const year = y + years;
  const day = m === 2 && d === 29 && !isLeapYear(year) ? 28 : d;
  return `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The leave year that contains a date. With the calendar basis it is 1 January
 * to 31 December. With the anniversary basis it runs from one joining-date
 * anniversary to the day before the next, and the first year starts on the
 * joining date itself. A date before the joining date gets the first year.
 */
export function leaveYearOf(basis: LeaveYearBasis, joinDate: string, date: string): LeaveYear {
  if (basis === "calendar") {
    const year = date.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const joinYear = Number(joinDate.slice(0, 4));
  let k = Math.max(0, Number(date.slice(0, 4)) - joinYear);
  if (anniversary(joinDate, k) > date) k -= 1;
  k = Math.max(0, k);
  return { from: anniversary(joinDate, k), to: previousDate(anniversary(joinDate, k + 1)) };
}

/** The leave year right after the given one. */
export function nextLeaveYear(basis: LeaveYearBasis, joinDate: string, year: LeaveYear): LeaveYear {
  return leaveYearOf(basis, joinDate, nextDate(year.to));
}

/** Every leave year a range of dates touches, in order. */
export function leaveYearsBetween(basis: LeaveYearBasis, joinDate: string, from: string, to: string): LeaveYear[] {
  const years: LeaveYear[] = [];
  let year = leaveYearOf(basis, joinDate, from);
  for (;;) {
    years.push(year);
    if (year.to >= to) return years;
    year = nextLeaveYear(basis, joinDate, year);
  }
}
