import { and, asc, eq, gte, isNull, lt, or } from "drizzle-orm";

import type { getDb } from "@/db";
import { devices, employees, rawPunches } from "@/db/schema";
import type { AttendanceStatus } from "@/db/schema/attendance";
import { daysInMonth, eachDate, nextDate, officeDateTimeToInstant } from "@/lib/time";

import type { DayResult } from "./compute-day";
import { computeDays } from "./recalc";

type Db = ReturnType<typeof getDb>;

export type GridCell = {
  status: AttendanceStatus;
  lateMinutes: number;
  earlyMinutes: number;
  missingOut: boolean;
  workedOnOffDay: boolean;
  isManual: boolean;
};

export type GridTotals = {
  /** Working days attended, late ones included. */
  present: number;
  late: number;
  absent: number;
  /** Paid and unpaid leave days together. */
  leave: number;
  /** Days with an arrival but no leaving time. */
  missingOut: number;
  /** Holidays and weekly off days they came in on. */
  workedOffDays: number;
  lateMinutes: number;
};

export type GridRow = {
  employee: { id: string; empCode: string; name: string; department: string | null };
  /** Keyed by office date. Days that have no row (before joining, after leaving, still in the future) are missing. */
  cells: Map<string, GridCell>;
  totals: GridTotals;
};

export type MonthGrid = {
  month: string;
  /** Every date of the month, YYYY-MM-DD. */
  dates: string[];
  rows: GridRow[];
};

export type GridInput = {
  employee: GridRow["employee"];
  days: { date: string; result: DayResult }[];
};

function toCell(result: DayResult): GridCell {
  return {
    status: result.status,
    lateMinutes: result.lateMinutes,
    earlyMinutes: result.earlyMinutes,
    missingOut: result.missingOut,
    workedOnOffDay: result.workedOnOffDay,
    isManual: result.isManual,
  };
}

/** Adds up a person's month. Pure. */
export function totalsOf(cells: Iterable<GridCell>): GridTotals {
  const totals: GridTotals = { present: 0, late: 0, absent: 0, leave: 0, missingOut: 0, workedOffDays: 0, lateMinutes: 0 };
  for (const cell of cells) {
    if (cell.status === "present" || cell.status === "late") totals.present += 1;
    if (cell.status === "late") {
      totals.late += 1;
      totals.lateMinutes += cell.lateMinutes;
    }
    if (cell.status === "absent") totals.absent += 1;
    if (cell.status === "leave_paid" || cell.status === "leave_unpaid") totals.leave += 1;
    if (cell.missingOut) totals.missingOut += 1;
    if (cell.workedOnOffDay) totals.workedOffDays += 1;
  }
  return totals;
}

/** Lays computed days out as one row per employee, sorted by name. Pure. */
export function buildMonthGrid(month: string, inputs: readonly GridInput[]): MonthGrid {
  const dates = eachDate(`${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, "0")}`);
  const rows = inputs.map(({ employee, days }) => {
    const cells = new Map(days.map(({ date, result }) => [date, toCell(result)]));
    return { employee, cells, totals: totalsOf(cells.values()) };
  });
  rows.sort((a, b) => a.employee.name.localeCompare(b.employee.name) || a.employee.empCode.localeCompare(b.employee.empCode));
  return { month, dates, rows };
}

/**
 * The month for everyone employed during it, worked out from the stored inputs
 * now. Days after today have no cell. Saves nothing.
 */
export async function loadMonthGrid(db: Db, month: string, today: string): Promise<MonthGrid> {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const to = last < today ? last : today;

  const staff = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(lt(employees.joinDate, nextDate(last)), or(isNull(employees.exitDate), gte(employees.exitDate, first))));
  // A person marked inactive without an exit date has left at an unknown time: keep them out of past months.
  const ids = staff.map((s) => s.id);

  if (to < first || ids.length === 0) return buildMonthGrid(month, []);

  const { people, toSave } = await computeDays(db, { employeeIds: ids, from: first, to });
  const daysByEmployee = new Map<string, GridInput["days"]>();
  for (const { employeeId, date, result } of toSave) {
    const list = daysByEmployee.get(employeeId) ?? [];
    list.push({ date, result });
    daysByEmployee.set(employeeId, list);
  }

  const inputs = people
    .filter((p) => p.active || p.exitDate !== null)
    .map((p) => ({
      employee: { id: p.id, empCode: p.empCode, name: p.name, department: p.department },
      days: daysByEmployee.get(p.id) ?? [],
    }));
  return buildMonthGrid(month, inputs);
}

export type DayDetail = {
  employee: { id: string; empCode: string; name: string; department: string | null; shiftName: string; shiftStart: string; shiftEnd: string; graceMinutes: number };
  date: string;
  /** Null when the person was not employed that day. */
  result: DayResult | null;
  punches: { at: Date; deviceSn: string; deviceName: string | null }[];
};

/** One person's day with every raw punch behind it, or null when the employee does not exist. */
export async function loadDayDetail(db: Db, employeeId: string, date: string): Promise<DayDetail | null> {
  const { people, shiftById, toSave } = await computeDays(db, { employeeIds: [employeeId], from: date, to: date });
  const person = people[0];
  const shift = person ? shiftById.get(person.shiftId) : undefined;
  if (!person || !shift) return null;

  const start = officeDateTimeToInstant(date, "00:00")!;
  const end = officeDateTimeToInstant(nextDate(date), "00:00")!;
  const punches = await db
    .select({ at: rawPunches.punchedAt, deviceSn: rawPunches.deviceSn, deviceName: devices.name })
    .from(rawPunches)
    .leftJoin(devices, eq(devices.serialNo, rawPunches.deviceSn))
    .where(and(eq(rawPunches.empCode, person.empCode), gte(rawPunches.punchedAt, start), lt(rawPunches.punchedAt, end)))
    .orderBy(asc(rawPunches.punchedAt));

  return {
    employee: {
      id: person.id,
      empCode: person.empCode,
      name: person.name,
      department: person.department,
      shiftName: shift.name,
      shiftStart: shift.startTime.slice(0, 5),
      shiftEnd: shift.endTime.slice(0, 5),
      graceMinutes: shift.graceMinutes,
    },
    date,
    result: toSave[0]?.result ?? null,
    punches,
  };
}
