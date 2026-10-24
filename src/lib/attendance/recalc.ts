import { and, asc, between, eq, gte, inArray, lt, sql } from "drizzle-orm";

import type { getDb } from "@/db";
import { attendanceAdjustments, attendanceDays, companySettings, employees, holidays, rawPunches, shifts } from "@/db/schema";
import { eachDate, nextDate, officeDateTimeToInstant } from "@/lib/time";

import { computeDay, type DayResult } from "./compute-day";
import { effectiveOverrides, type AdjustmentRow } from "./overrides";

type Db = ReturnType<typeof getDb>;

/** One call never covers more than this many days, so a typo cannot lock the database. */
export const MAX_RANGE_DAYS = 366;

export type RecalcScope = {
  /** Employees to recompute. Null means every active employee. Named employees are recomputed even when inactive. */
  employeeIds: string[] | null;
  /** First office date, YYYY-MM-DD. */
  from: string;
  /** Last office date, YYYY-MM-DD, included. */
  to: string;
};

export type RecalcSummary = { employees: number; days: number; removed: number };

/** Rows per INSERT: fifteen columns each stays far below Postgres' parameter limit. */
const BATCH_SIZE = 500;

function key(employeeId: string, date: string): string {
  return `${employeeId}|${date}`;
}

/**
 * Rebuilds attendance_days for the employees and dates in the scope from the
 * raw inputs: punches, shifts, weekly off days, holidays and manual
 * adjustments. Safe to run any time and any number of times: a day is replaced
 * with what computeDay says now, and a day that should have no row (before the
 * join date or after the exit date) has its row removed. It never writes
 * anything but attendance_days.
 *
 * Approved leave joins the inputs in M4, and M5 makes this skip months whose
 * payroll is finalized.
 */
export async function recalc(db: Db, scope: RecalcScope): Promise<RecalcSummary> {
  const dates = eachDate(scope.from, scope.to);
  if (dates.length === 0) return { employees: 0, days: 0, removed: 0 };
  if (dates.length > MAX_RANGE_DAYS) throw new Error(`Recalculation covers at most ${MAX_RANGE_DAYS} days at a time.`);

  return db.transaction(async (tx) => {
    const people = await tx
      .select()
      .from(employees)
      .where(
        scope.employeeIds === null
          ? eq(employees.active, true)
          : scope.employeeIds.length === 0
            ? sql`false`
            : inArray(employees.id, scope.employeeIds),
      );
    if (people.length === 0) return { employees: 0, days: 0, removed: 0 };

    const ids = people.map((p) => p.id);
    const codes = people.map((p) => p.empCode);

    const [settings] = await tx.select().from(companySettings).where(eq(companySettings.id, 1));
    const weeklyOffDays = settings?.weeklyOffDays ?? [];

    const holidayRows = await tx.select({ date: holidays.date }).from(holidays).where(between(holidays.date, scope.from, scope.to));
    const holidayDates = new Set(holidayRows.map((h) => h.date));

    const shiftRows = await tx.select().from(shifts).where(inArray(shifts.id, [...new Set(people.map((p) => p.shiftId))]));
    const shiftById = new Map(shiftRows.map((s) => [s.id, s]));

    // Punches for the whole range: from midnight at the start to midnight after the end, office time.
    const rangeStart = officeDateTimeToInstant(scope.from, "00:00")!;
    const afterEnd = officeDateTimeToInstant(nextDate(scope.to), "00:00")!;
    const punchRows = await tx
      .select({ empCode: rawPunches.empCode, punchedAt: rawPunches.punchedAt })
      .from(rawPunches)
      .where(and(inArray(rawPunches.empCode, codes), gte(rawPunches.punchedAt, rangeStart), lt(rawPunches.punchedAt, afterEnd)));
    const punchesByCode = new Map<string, Date[]>();
    for (const p of punchRows) {
      const list = punchesByCode.get(p.empCode) ?? [];
      list.push(p.punchedAt);
      punchesByCode.set(p.empCode, list);
    }

    const adjustmentRows = await tx
      .select()
      .from(attendanceAdjustments)
      .where(and(inArray(attendanceAdjustments.employeeId, ids), between(attendanceAdjustments.date, scope.from, scope.to)))
      .orderBy(asc(attendanceAdjustments.createdAt));
    const adjustmentsByDay = new Map<string, AdjustmentRow[]>();
    for (const a of adjustmentRows) {
      const k = key(a.employeeId, a.date);
      const list = adjustmentsByDay.get(k) ?? [];
      list.push({ field: a.field, newValue: a.newValue, createdAt: a.createdAt });
      adjustmentsByDay.set(k, list);
    }

    const toSave: { employeeId: string; date: string; result: DayResult }[] = [];
    const toRemove = new Map<string, string[]>();

    for (const person of people) {
      const shift = shiftById.get(person.shiftId);
      if (!shift) throw new Error(`Employee ${person.empCode} has a shift that no longer exists.`);
      const punches = punchesByCode.get(person.empCode) ?? [];

      for (const date of dates) {
        const result = computeDay({
          date,
          employee: { joinDate: person.joinDate, exitDate: person.exitDate },
          shift: { startTime: shift.startTime, endTime: shift.endTime, graceMinutes: shift.graceMinutes },
          weeklyOffDays,
          isHoliday: holidayDates.has(date),
          punches,
          leave: null,
          overrides: effectiveOverrides(adjustmentsByDay.get(key(person.id, date)) ?? []),
        });
        if (result) toSave.push({ employeeId: person.id, date, result });
        else toRemove.set(person.id, [...(toRemove.get(person.id) ?? []), date]);
      }
    }

    let removed = 0;
    for (const [employeeId, removeDates] of toRemove) {
      const gone = await tx
        .delete(attendanceDays)
        .where(and(eq(attendanceDays.employeeId, employeeId), inArray(attendanceDays.date, removeDates)))
        .returning({ id: attendanceDays.id });
      removed += gone.length;
    }

    const now = new Date();
    for (let i = 0; i < toSave.length; i += BATCH_SIZE) {
      const batch = toSave.slice(i, i + BATCH_SIZE).map(({ employeeId, date, result }) => ({
        employeeId,
        date,
        status: result.status,
        firstIn: result.firstIn,
        lastOut: result.lastOut,
        lateMinutes: result.lateMinutes,
        earlyMinutes: result.earlyMinutes,
        missingOut: result.missingOut,
        workedOnOffDay: result.workedOnOffDay,
        punchCount: result.punchCount,
        isManual: result.isManual,
        computedAt: now,
      }));
      await tx
        .insert(attendanceDays)
        .values(batch)
        .onConflictDoUpdate({
          target: [attendanceDays.employeeId, attendanceDays.date],
          set: {
            status: sql`excluded.status`,
            firstIn: sql`excluded.first_in`,
            lastOut: sql`excluded.last_out`,
            lateMinutes: sql`excluded.late_minutes`,
            earlyMinutes: sql`excluded.early_minutes`,
            missingOut: sql`excluded.missing_out`,
            workedOnOffDay: sql`excluded.worked_on_off_day`,
            punchCount: sql`excluded.punch_count`,
            isManual: sql`excluded.is_manual`,
            computedAt: sql`excluded.computed_at`,
          },
        });
    }

    return { employees: people.length, days: toSave.length, removed };
  });
}
