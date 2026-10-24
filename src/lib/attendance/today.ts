import { and, asc, eq, gte, lt } from "drizzle-orm";

import type { getDb } from "@/db";
import { devices, rawPunches } from "@/db/schema";
import { nextDate, officeDateTimeToInstant, officeMinuteOfDay, timeToMinutes, toOfficeDate } from "@/lib/time";

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

export type ArrivalBucket = {
  /** Start of the bucket as HH:MM, office time. */
  label: string;
  /** People whose first punch fell in the bucket, late ones included. */
  count: number;
  /** How many of them were late. */
  late: number;
};

/**
 * How arrivals spread over the morning: first punches grouped in buckets of
 * `bucketMinutes`. Buckets run without gaps from the first arrival to the last
 * so a quiet stretch shows as an empty bar. Pure.
 */
export function arrivalBuckets(entries: readonly TodayEntry[], bucketMinutes = 15): ArrivalBucket[] {
  const arrivals = entries
    .filter((e) => e.firstIn !== null && (e.group === "in" || e.group === "worked_off_day"))
    .map((e) => ({ minute: officeMinuteOfDay(e.firstIn as Date), late: e.status === "late" }));
  if (arrivals.length === 0) return [];

  const start = (minute: number) => Math.floor(minute / bucketMinutes) * bucketMinutes;
  const first = Math.min(...arrivals.map((a) => start(a.minute)));
  const last = Math.max(...arrivals.map((a) => start(a.minute)));

  const buckets: ArrivalBucket[] = [];
  for (let minute = first; minute <= last; minute += bucketMinutes) {
    const inBucket = arrivals.filter((a) => start(a.minute) === minute);
    const hh = String(Math.floor(minute / 60)).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    buckets.push({ label: `${hh}:${mm}`, count: inBucket.length, late: inBucket.filter((a) => a.late).length });
  }
  return buckets;
}

export type DayPunch = { empCode: string; at: Date; deviceName: string | null };

/** Every raw punch of one office date, oldest first. */
export async function loadDayPunches(db: Db, date: string): Promise<DayPunch[]> {
  const start = officeDateTimeToInstant(date, "00:00")!;
  const end = officeDateTimeToInstant(nextDate(date), "00:00")!;
  return db
    .select({ empCode: rawPunches.empCode, at: rawPunches.punchedAt, deviceName: devices.name })
    .from(rawPunches)
    .leftJoin(devices, eq(devices.serialNo, rawPunches.deviceSn))
    .where(and(gte(rawPunches.punchedAt, start), lt(rawPunches.punchedAt, end)))
    .orderBy(asc(rawPunches.punchedAt));
}

/** Each employee code's punch times, oldest first. Pure. */
export function groupPunchesByCode(punches: readonly DayPunch[]): Map<string, Date[]> {
  const byCode = new Map<string, Date[]>();
  for (const punch of punches) {
    const list = byCode.get(punch.empCode) ?? [];
    list.push(punch.at);
    byCode.set(punch.empCode, list);
  }
  for (const list of byCode.values()) list.sort((a, b) => a.getTime() - b.getTime());
  return byCode;
}

export type FeedItem = {
  empCode: string;
  /** The employee's name, or null when no employee has this code. */
  name: string | null;
  at: Date;
  /** The person's first punch of the day is when they arrived, later ones are punches again. */
  kind: "arrived" | "again";
  deviceName: string | null;
};

/** The latest punches of the day, newest first. Pure. */
export function buildPunchFeed(punches: readonly DayPunch[], entries: readonly Pick<TodayEntry, "empCode" | "name">[], limit = 8): FeedItem[] {
  const nameByCode = new Map(entries.map((e) => [e.empCode, e.name]));
  const firstByCode = new Map<string, number>();
  for (const punch of punches) {
    const t = punch.at.getTime();
    const seen = firstByCode.get(punch.empCode);
    if (seen === undefined || t < seen) firstByCode.set(punch.empCode, t);
  }
  return [...punches]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit)
    .map((punch) => ({
      empCode: punch.empCode,
      name: nameByCode.get(punch.empCode) ?? null,
      at: punch.at,
      kind: firstByCode.get(punch.empCode) === punch.at.getTime() ? "arrived" : "again",
      deviceName: punch.deviceName,
    }));
}
