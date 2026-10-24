import { and, eq, inArray } from "drizzle-orm";

import type { getDb } from "@/db";
import { employees } from "@/db/schema";
import { eachDate, previousDate, toOfficeDate } from "@/lib/time";

import { MAX_RANGE_DAYS, recalc } from "./recalc";

type Db = ReturnType<typeof getDb>;

/**
 * When an input to attendance changes, the days it touches are recomputed
 * straight away so screens are never behind. These functions never throw: the
 * change that caused them is already saved, and a failed recalculation is
 * repaired by the nightly job, so it must not undo or block the original action.
 *
 * Shifts are not versioned, so a recalculation applies the shift as it is
 * now. For that reason a change to a shift, a weekly off day or an employee's
 * shift is applied from today onward and earlier days keep how they were
 * computed. A holiday is tied to one date, so that one date is recomputed.
 */
async function safely(what: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(`[attendance] recalculation after ${what} failed; the nightly job will catch up`, error);
  }
}

/** Recomputes in windows the size recalc accepts, for a range that may be long. */
async function recalcInWindows(db: Db, employeeIds: string[] | null, from: string, to: string): Promise<void> {
  const dates = eachDate(from, to);
  for (let i = 0; i < dates.length; i += MAX_RANGE_DAYS) {
    const window = dates.slice(i, i + MAX_RANGE_DAYS);
    await recalc(db, { employeeIds, from: window[0], to: window[window.length - 1] });
  }
}

/**
 * Newly stored punches. Looks up the employees by code, ignores codes nobody
 * has, and recomputes every day from the earliest to the latest new punch,
 * which covers a device catching up after an outage as well as a live punch.
 */
export async function recalcForNewPunches(db: Db, punches: readonly { empCode: string; punchedAt: Date }[]): Promise<void> {
  if (punches.length === 0) return;
  await safely("new punches", async () => {
    const codes = [...new Set(punches.map((p) => p.empCode))];
    const people = await db.select({ id: employees.id, empCode: employees.empCode }).from(employees).where(inArray(employees.empCode, codes));
    if (people.length === 0) return;

    const known = new Set(people.map((p) => p.empCode));
    const dates = punches.filter((p) => known.has(p.empCode)).map((p) => toOfficeDate(p.punchedAt)).sort();
    await recalcInWindows(db, people.map((p) => p.id), dates[0], dates[dates.length - 1]);
  });
}

/** A shift's start, end or grace changed: today for everyone on it. */
export async function recalcAfterShiftChange(db: Db, shiftId: string, today = toOfficeDate(new Date())): Promise<void> {
  await safely("a shift change", async () => {
    const people = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.shiftId, shiftId), eq(employees.active, true)));
    if (people.length > 0) await recalc(db, { employeeIds: people.map((p) => p.id), from: today, to: today });
  });
}

export type EmployeeDates = { shiftId: string; joinDate: string; exitDate: string | null };

/**
 * An employee's shift, join date or exit date changed. A new shift applies from
 * today. A moved join or exit date adds or removes days, so the range runs from
 * the earliest date involved to today, at most a year back.
 */
export async function recalcAfterEmployeeChange(
  db: Db,
  employeeId: string,
  before: EmployeeDates,
  after: EmployeeDates,
  today = toOfficeDate(new Date()),
): Promise<void> {
  const joinMoved = before.joinDate !== after.joinDate;
  const exitMoved = before.exitDate !== after.exitDate;
  if (before.shiftId === after.shiftId && !joinMoved && !exitMoved) return;

  await safely("an employee change", async () => {
    let from = today;
    if (joinMoved) from = [from, before.joinDate, after.joinDate].sort()[0];
    if (exitMoved) from = [from, before.exitDate ?? today, after.exitDate ?? today].sort()[0];

    let earliest = today;
    for (let i = 0; i < MAX_RANGE_DAYS - 1; i += 1) earliest = previousDate(earliest);
    if (from < earliest) from = earliest;

    await recalcInWindows(db, [employeeId], from, today);
  });
}

/** A holiday was added or removed: that one date for every active employee. Future dates have no rows yet. */
export async function recalcAfterHolidayChange(db: Db, date: string, today = toOfficeDate(new Date())): Promise<void> {
  if (date > today) return;
  await safely("a holiday change", () => recalc(db, { employeeIds: null, from: date, to: date }));
}

/** The weekly off days changed: today for every active employee. */
export async function recalcAfterWeeklyOffChange(db: Db, today = toOfficeDate(new Date())): Promise<void> {
  await safely("a change to the weekly off days", () => recalc(db, { employeeIds: null, from: today, to: today }));
}

/** One employee and one date, after a manual adjustment. */
export async function recalcDay(db: Db, employeeId: string, date: string): Promise<void> {
  await safely("an adjustment", () => recalc(db, { employeeIds: [employeeId], from: date, to: date }));
}
