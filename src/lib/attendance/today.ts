import type { getDb } from "@/db";
import { officeMinuteOfDay, timeToMinutes, toOfficeDate } from "@/lib/time";

import type { AttendanceStatus } from "@/db/schema/attendance";

import type { DayResult } from "./compute-day";
import { computeDays } from "./recalc";

type Db = ReturnType<typeof getDb>;

/**
 * Where someone stands today.
 * in: punched in (late people are in and also late). worked_off_day: came in on a holiday or weekly off day.
 * not_in_yet: no punch, and the shift has not ended. absent: no punch and the shift is over.
 */
export type TodayGroup = "in" | "worked_off_day" | "on_leave" | "not_in_yet" | "absent" | "off";

export type TodayInput = {
  employee: { id: string; empCode: string; name: string; department: string | null };
  shift: { name: string; startTime: string; endTime: string };
  result: DayResult;
};

export type TodayEntry = {
  id: string;
  empCode: string;
  name: string;
  department: string | null;
  group: TodayGroup;
  status: AttendanceStatus;
  shiftLabel: string;
  firstIn: Date | null;
  lastOut: Date | null;
  lateMinutes: number;
  missingOut: boolean;
};

export type TodayBoard = {
  /** Set when today is a holiday or weekly off day for the office. */
  offDay: "holiday" | "weekly_off" | null;
  counts: { in: number; late: number; onLeave: number; notInYet: number; absent: number };
  entries: TodayEntry[];
};

function groupOf(input: TodayInput, nowMinute: number): TodayGroup {
  const { result, shift } = input;
  if (result.status === "holiday" || result.status === "weekly_off") return result.workedOnOffDay ? "worked_off_day" : "off";
  if (result.status === "leave_paid" || result.status === "leave_unpaid") return "on_leave";
  if (result.status === "absent") {
    const end = timeToMinutes(shift.endTime);
    return end !== null && nowMinute >= end ? "absent" : "not_in_yet";
  }
  return "in";
}

/**
 * Sorts today's computed days into the groups the Today screen shows. A person
 * without a punch is "not in yet" until their shift ends, then "absent".
 * Pure: the clock comes in as a parameter.
 */
export function buildTodayBoard(inputs: readonly TodayInput[], now: Date): TodayBoard {
  const nowMinute = officeMinuteOfDay(now);
  const entries: TodayEntry[] = inputs.map((input) => ({
    id: input.employee.id,
    empCode: input.employee.empCode,
    name: input.employee.name,
    department: input.employee.department,
    group: groupOf(input, nowMinute),
    status: input.result.status,
    shiftLabel: `${input.shift.startTime.slice(0, 5)} to ${input.shift.endTime.slice(0, 5)}`,
    firstIn: input.result.firstIn,
    lastOut: input.result.lastOut,
    lateMinutes: input.result.lateMinutes,
    missingOut: input.result.missingOut,
  }));
  entries.sort((a, b) => a.name.localeCompare(b.name) || a.empCode.localeCompare(b.empCode));

  const statuses = new Set(inputs.map((i) => i.result.status));
  const offDay = statuses.has("holiday") ? "holiday" : statuses.has("weekly_off") ? "weekly_off" : null;

  const count = (group: TodayGroup) => entries.filter((e) => e.group === group).length;
  return {
    offDay,
    counts: {
      in: count("in") + count("worked_off_day"),
      late: entries.filter((e) => e.group === "in" && e.status === "late").length,
      onLeave: count("on_leave"),
      notInYet: count("not_in_yet"),
      absent: count("absent"),
    },
    entries,
  };
}

/** Today's board for every active employee, worked out from the inputs now. Saves nothing. */
export async function loadTodayBoard(db: Db, now: Date): Promise<TodayBoard> {
  const today = toOfficeDate(now);
  const { people, shiftById, toSave } = await computeDays(db, { employeeIds: null, from: today, to: today });
  const personById = new Map(people.map((p) => [p.id, p]));

  const inputs: TodayInput[] = [];
  for (const { employeeId, result } of toSave) {
    const person = personById.get(employeeId);
    const shift = person ? shiftById.get(person.shiftId) : undefined;
    if (!person || !shift) continue;
    inputs.push({
      employee: { id: person.id, empCode: person.empCode, name: person.name, department: person.department },
      shift: { name: shift.name, startTime: shift.startTime, endTime: shift.endTime },
      result,
    });
  }
  return buildTodayBoard(inputs, now);
}
