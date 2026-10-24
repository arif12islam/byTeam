import type { GridCell, MonthGrid } from "@/lib/attendance/month";
import { weekdayOf } from "@/lib/time";

/**
 * The month in numbers, worked out from the attendance grid. Pure: the grid
 * comes in, the figures come out, nothing is saved.
 *
 * Present counts late days too. The attendance rate is days attended over days
 * attended plus days absent, so leave never counts against anyone.
 */

export type DayKind = "working" | "off" | "future";

export type DailyPoint = {
  date: string;
  /** Day of the month. */
  day: number;
  /** 0 is Sunday. */
  weekday: number;
  kind: DayKind;
  onTime: number;
  late: number;
  absent: number;
  leave: number;
};

export type DepartmentRow = {
  department: string;
  people: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  /** Attended over attended plus absent, 0 to 1. Null when nobody was due in. */
  rate: number | null;
};

export type PersonFigure = {
  employeeId: string;
  empCode: string;
  name: string;
  department: string | null;
  present: number;
  late: number;
  absent: number;
  leave: number;
  lateMinutes: number;
};

export type AttendanceReport = {
  month: string;
  people: number;
  totals: {
    present: number;
    late: number;
    absent: number;
    leavePaid: number;
    leaveUnpaid: number;
    lateMinutes: number;
    missingOut: number;
    workedOffDays: number;
    correctedByHand: number;
  };
  /** Attended over attended plus absent, 0 to 1. Null when nobody was due in. */
  attendanceRate: number | null;
  /** On-time arrivals over all arrivals, 0 to 1. Null when nobody came in. */
  punctualityRate: number | null;
  /** Days of the month that were working days for someone and are over. */
  workingDays: number;
  daily: DailyPoint[];
  departments: DepartmentRow[];
  mostLate: PersonFigure[];
  mostAbsent: PersonFigure[];
  /** Everyone with at least one day attended and no late or absent day. */
  perfect: PersonFigure[];
};

const NO_DEPARTMENT = "No department";

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

const isLeave = (cell: GridCell) => cell.status === "leave_paid" || cell.status === "leave_unpaid";
const isOff = (cell: GridCell) => cell.status === "weekly_off" || cell.status === "holiday";

export function buildAttendanceReport(grid: MonthGrid, options: { limit?: number } = {}): AttendanceReport {
  const limit = options.limit ?? 5;

  const totals = {
    present: 0,
    late: 0,
    absent: 0,
    leavePaid: 0,
    leaveUnpaid: 0,
    lateMinutes: 0,
    missingOut: 0,
    workedOffDays: 0,
    correctedByHand: 0,
  };
  const figures: PersonFigure[] = [];
  const byDepartment = new Map<string, DepartmentRow>();

  for (const row of grid.rows) {
    const t = row.totals;
    totals.present += t.present;
    totals.late += t.late;
    totals.absent += t.absent;
    totals.lateMinutes += t.lateMinutes;
    totals.missingOut += t.missingOut;
    totals.workedOffDays += t.workedOffDays;
    for (const cell of row.cells.values()) {
      if (cell.status === "leave_paid") totals.leavePaid += 1;
      if (cell.status === "leave_unpaid") totals.leaveUnpaid += 1;
      if (cell.isManual) totals.correctedByHand += 1;
    }

    figures.push({
      employeeId: row.employee.id,
      empCode: row.employee.empCode,
      name: row.employee.name,
      department: row.employee.department,
      present: t.present,
      late: t.late,
      absent: t.absent,
      leave: t.leave,
      lateMinutes: t.lateMinutes,
    });

    const key = row.employee.department?.trim() || NO_DEPARTMENT;
    const dept = byDepartment.get(key) ?? { department: key, people: 0, present: 0, late: 0, absent: 0, leave: 0, rate: null };
    dept.people += 1;
    dept.present += t.present;
    dept.late += t.late;
    dept.absent += t.absent;
    dept.leave += t.leave;
    byDepartment.set(key, dept);
  }

  const departments = [...byDepartment.values()].map((d) => ({ ...d, rate: ratio(d.present, d.present + d.absent) }));
  // Biggest team first, then by name. "No department" always goes last.
  departments.sort((a, b) => {
    if (a.department === NO_DEPARTMENT) return 1;
    if (b.department === NO_DEPARTMENT) return -1;
    return b.people - a.people || a.department.localeCompare(b.department);
  });

  const daily: DailyPoint[] = grid.dates.map((date) => {
    const point: DailyPoint = {
      date,
      day: Number(date.slice(8)),
      weekday: weekdayOf(date),
      kind: "future",
      onTime: 0,
      late: 0,
      absent: 0,
      leave: 0,
    };
    let cells = 0;
    let offCells = 0;
    for (const row of grid.rows) {
      const cell = row.cells.get(date);
      if (!cell) continue;
      cells += 1;
      if (cell.status === "present") point.onTime += 1;
      else if (cell.status === "late") point.late += 1;
      else if (cell.status === "absent") point.absent += 1;
      else if (isLeave(cell)) point.leave += 1;
      else if (isOff(cell)) offCells += 1;
    }
    if (cells > 0) point.kind = offCells === cells ? "off" : "working";
    return point;
  });

  const workingDays = daily.filter((d) => d.kind === "working").length;

  const mostLate = figures
    .filter((f) => f.late > 0)
    .sort((a, b) => b.late - a.late || b.lateMinutes - a.lateMinutes || a.name.localeCompare(b.name))
    .slice(0, limit);
  const mostAbsent = figures
    .filter((f) => f.absent > 0)
    .sort((a, b) => b.absent - a.absent || a.name.localeCompare(b.name))
    .slice(0, limit);
  const perfect = figures.filter((f) => f.present > 0 && f.late === 0 && f.absent === 0);

  return {
    month: grid.month,
    people: grid.rows.length,
    totals,
    attendanceRate: ratio(totals.present, totals.present + totals.absent),
    punctualityRate: ratio(totals.present - totals.late, totals.present),
    workingDays,
    daily,
    departments,
    mostLate,
    mostAbsent,
    perfect,
  };
}

/** 0.9234 as "92%". Null becomes a dash. */
export function formatRate(rate: number | null): string {
  return rate === null ? "-" : `${Math.round(rate * 100)}%`;
}
