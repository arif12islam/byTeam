import type { AttendanceStatus } from "@/db/schema/attendance";
import { officeMinuteOfDay, timeToMinutes, toOfficeDate, weekdayOf } from "@/lib/time";

/**
 * A second punch this soon after the first is a double tap, not leaving. The
 * device already ignores most repeats, but a face that is read twice a few
 * seconds apart still gets through.
 */
export const MIN_PUNCH_SPAN_MINUTES = 5;

export type DayOutage = { startTime: string; endTime: string };

export type DayShift = {
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
  graceMinutes: number;
};

/** Manual overrides in force for the day: the newest adjustment per field. A field left out is not overridden. */
export type DayOverrides = {
  status?: AttendanceStatus;
  firstIn?: Date;
  lastOut?: Date;
};

export type DayInput = {
  /** The office date, YYYY-MM-DD. */
  date: string;
  employee: { joinDate: string; exitDate: string | null };
  shift: DayShift;
  /** 0 is Sunday, 6 is Saturday. */
  weeklyOffDays: readonly number[];
  isHoliday: boolean;
  /** Every punch the device sent for this person. Ones that fall on other office dates are ignored. */
  punches: readonly Date[];
  /** Approved leave covering the date, if any. */
  leave: { paid: boolean } | null;
  /** Office outages on this date (power or device down), as "HH:MM" times. */
  outages?: readonly DayOutage[];
  overrides?: DayOverrides;
};

export type DayResult = {
  status: AttendanceStatus;
  firstIn: Date | null;
  lastOut: Date | null;
  lateMinutes: number;
  earlyMinutes: number;
  missingOut: boolean;
  workedOnOffDay: boolean;
  punchCount: number;
  isManual: boolean;
};

/** The outage windows as minutes after midnight, dropping any that are not valid times. */
function outageMinutes(outages: readonly DayOutage[] | undefined): { from: number; to: number }[] {
  const windows: { from: number; to: number }[] = [];
  for (const o of outages ?? []) {
    const from = timeToMinutes(o.startTime);
    const to = timeToMinutes(o.endTime);
    if (from !== null && to !== null && to > from) windows.push({ from, to });
  }
  return windows.sort((a, b) => a.from - b.from);
}

/**
 * The last minute at which arriving still counts as on time: the shift start
 * plus grace. When an outage was on at that moment nobody could punch, so the
 * limit moves to the end of the outage plus the usual grace, and again if
 * another outage covers the new limit.
 */
export function onTimeLimit(startMinutes: number, graceMinutes: number, windows: readonly { from: number; to: number }[]): number {
  let limit = startMinutes + graceMinutes;
  for (const w of windows) {
    if (w.from <= limit && limit < w.to) limit = w.to + graceMinutes;
  }
  return limit;
}

/**
 * Works out one employee's day from its inputs and nothing else, so any day can
 * be recomputed safely. Returns null for a date before the join date or after
 * the exit date: such days have no row.
 *
 * 1. Day type: a holiday, else a weekly off day, else a working day.
 * 2. First punch is in, last punch is out. One punch, or a second one within
 *    MIN_PUNCH_SPAN_MINUTES, sets missingOut and leaves lastOut empty.
 * 3. A working day with no punch is absent. Punches on a holiday or weekly off
 *    day keep the day type and set workedOnOffDay.
 * 4. Late when the first punch, by the office clock to the minute, is after the
 *    shift start plus grace (moved to the end of an office outage that covers
 *    that moment, see `onTimeLimit`). lateMinutes counts from the shift start.
 *    Early when the last punch is before the shift end. Earlier than the start
 *    is not late. A working day with no punch is not absent when an outage
 *    covers the whole shift: nobody could punch, so it counts as present.
 * 5. Approved leave on a working day makes it leave_paid or leave_unpaid. Status
 *    priority is holiday and weekly off, then leave, then present or late, then
 *    absent.
 * 6. Manual overrides go last and set isManual. Overridden times are used for
 *    late, early and missingOut; an overridden status replaces the result.
 */
export function computeDay(input: DayInput): DayResult | null {
  const { date, employee, shift, weeklyOffDays, isHoliday, leave, overrides } = input;

  if (date < employee.joinDate) return null;
  if (employee.exitDate !== null && date > employee.exitDate) return null;

  // Punches that belong to this office date, earliest first.
  const own = input.punches
    .filter((p) => toOfficeDate(p) === date)
    .map((p) => p.getTime())
    .sort((a, b) => a - b);

  let firstIn: Date | null = own.length > 0 ? new Date(own[0]) : null;
  let lastOut: Date | null = null;
  if (own.length > 1) {
    const span = (own[own.length - 1] - own[0]) / 60_000;
    if (span >= MIN_PUNCH_SPAN_MINUTES) lastOut = new Date(own[own.length - 1]);
  }

  let isManual = false;
  if (overrides?.firstIn) {
    firstIn = overrides.firstIn;
    isManual = true;
  }
  if (overrides?.lastOut) {
    lastOut = overrides.lastOut;
    isManual = true;
  }

  const hasActivity = firstIn !== null;
  const dayType: "holiday" | "weekly_off" | "working" = isHoliday
    ? "holiday"
    : weeklyOffDays.includes(weekdayOf(date))
      ? "weekly_off"
      : "working";

  let status: AttendanceStatus;
  let lateMinutes = 0;
  let earlyMinutes = 0;

  if (dayType !== "working") {
    status = dayType;
  } else if (leave) {
    status = leave.paid ? "leave_paid" : "leave_unpaid";
  } else if (hasActivity) {
    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);
    if (start === null || end === null) throw new Error(`Shift times are not valid: ${shift.startTime} to ${shift.endTime}`);

    status = "present";
    const arrived = officeMinuteOfDay(firstIn!);
    if (arrived > onTimeLimit(start, shift.graceMinutes, outageMinutes(input.outages))) {
      status = "late";
      lateMinutes = arrived - start;
    }
    if (lastOut) {
      const left = officeMinuteOfDay(lastOut);
      if (left < end) earlyMinutes = end - left;
    }
  } else {
    const start = timeToMinutes(shift.startTime);
    const end = timeToMinutes(shift.endTime);
    const wholeShiftOut = start !== null && end !== null && outageMinutes(input.outages).some((w) => w.from <= start && w.to >= end);
    status = wholeShiftOut ? "present" : "absent";
  }

  if (overrides?.status) {
    status = overrides.status;
    isManual = true;
  }

  return {
    status,
    firstIn,
    lastOut,
    lateMinutes,
    earlyMinutes,
    missingOut: hasActivity && lastOut === null,
    workedOnOffDay: dayType !== "working" && hasActivity,
    punchCount: own.length,
    isManual,
  };
}
