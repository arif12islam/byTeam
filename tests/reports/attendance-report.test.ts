import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import { buildMonthGrid, type GridInput } from "@/lib/attendance/month";
import { buildAttendanceReport, formatRate } from "@/lib/reports/attendance-report";

const day = (status: DayResult["status"], extra: Partial<DayResult> = {}): DayResult => ({
  status,
  firstIn: null,
  lastOut: null,
  lateMinutes: 0,
  earlyMinutes: 0,
  missingOut: false,
  workedOnOffDay: false,
  punchCount: 0,
  isManual: false,
  ...extra,
});

const person = (id: string, name: string, department: string | null, days: [string, DayResult][]): GridInput => ({
  employee: { id, empCode: id.toUpperCase(), name, department },
  days: days.map(([date, result]) => ({ date, result })),
});

// 2031-03-02 is a Sunday. Days 2 to 5 are working days, day 6 (Thursday) has no rows yet.
const M = "2031-03";
const d = (n: number) => `${M}-${String(n).padStart(2, "0")}`;

const grid = buildMonthGrid(M, [
  person("a", "Ana", "Sales", [
    [d(2), day("present")],
    [d(3), day("late", { lateMinutes: 20 })],
    [d(4), day("late", { lateMinutes: 5 })],
    [d(5), day("present")],
  ]),
  person("b", "Bela", "Sales", [
    [d(2), day("absent")],
    [d(3), day("absent")],
    [d(4), day("leave_paid")],
    [d(5), day("present", { isManual: true })],
  ]),
  person("c", "Chand", null, [
    [d(2), day("present")],
    [d(3), day("present")],
    [d(4), day("present", { missingOut: true })],
    [d(5), day("leave_unpaid")],
  ]),
  person("e", "Esha", "Accounts", [
    [d(2), day("present")],
    [d(3), day("present")],
    [d(4), day("present")],
    [d(5), day("present")],
  ]),
]);

describe("buildAttendanceReport", () => {
  const report = buildAttendanceReport(grid);

  it("adds up the month", () => {
    expect(report.people).toBe(4);
    expect(report.totals).toEqual({
      present: 4 + 1 + 3 + 4,
      late: 2,
      absent: 2,
      leavePaid: 1,
      leaveUnpaid: 1,
      lateMinutes: 25,
      missingOut: 1,
      workedOffDays: 0,
      correctedByHand: 1,
    });
  });

  it("works out the attendance rate without counting leave against anyone", () => {
    // 12 days attended and 2 absent. The two leave days are left out of both sides.
    expect(report.attendanceRate).toBeCloseTo(12 / 14, 10);
  });

  it("works out punctuality from arrivals, not from all days", () => {
    // 12 arrivals, 2 late.
    expect(report.punctualityRate).toBeCloseTo(10 / 12, 10);
  });

  it("builds a point for every day of the month and marks days with no rows as future", () => {
    expect(report.daily).toHaveLength(31);
    expect(report.daily[1]).toMatchObject({ date: d(2), day: 2, weekday: 0, kind: "working", onTime: 3, late: 0, absent: 1, leave: 0 });
    expect(report.daily[2]).toMatchObject({ date: d(3), kind: "working", onTime: 2, late: 1, absent: 1 });
    expect(report.daily[3]).toMatchObject({ date: d(4), onTime: 2, late: 1, absent: 0, leave: 1 });
    expect(report.daily[4]).toMatchObject({ date: d(5), onTime: 3, late: 0, absent: 0, leave: 1 });
    expect(report.daily[5].kind).toBe("future");
    expect(report.workingDays).toBe(4);
  });

  it("calls a day off when every row for it is a weekly off day or holiday", () => {
    const off = buildAttendanceReport(
      buildMonthGrid(M, [
        person("a", "Ana", null, [[d(7), day("weekly_off")], [d(8), day("holiday")]]),
        person("b", "Bela", null, [[d(7), day("weekly_off")], [d(8), day("holiday")]]),
      ]),
    );
    expect(off.daily[6].kind).toBe("off");
    expect(off.daily[7].kind).toBe("off");
    expect(off.workingDays).toBe(0);
  });

  it("keeps a day a working day when only some people were off", () => {
    const mixed = buildAttendanceReport(
      buildMonthGrid(M, [
        person("a", "Ana", null, [[d(7), day("weekly_off")]]),
        person("b", "Bela", null, [[d(7), day("present")]]),
      ]),
    );
    expect(mixed.daily[6]).toMatchObject({ kind: "working", onTime: 1 });
  });

  it("groups by department, biggest team first, with no department last", () => {
    expect(report.departments.map((x) => [x.department, x.people])).toEqual([
      ["Sales", 2],
      ["Accounts", 1],
      ["No department", 1],
    ]);
    const sales = report.departments[0];
    expect(sales).toMatchObject({ present: 5, late: 2, absent: 2, leave: 1 });
    expect(sales.rate).toBeCloseTo(5 / 7, 10);
  });

  it("lists the most late people, then most absent, leaving out people with none", () => {
    expect(report.mostLate.map((p) => [p.name, p.late])).toEqual([["Ana", 2]]);
    expect(report.mostAbsent.map((p) => [p.name, p.absent])).toEqual([["Bela", 2]]);
  });

  it("breaks ties by late minutes, then name, and honours the limit", () => {
    const tied = buildAttendanceReport(
      buildMonthGrid(M, [
        person("a", "Zed", null, [[d(2), day("late", { lateMinutes: 5 })]]),
        person("b", "Amy", null, [[d(2), day("late", { lateMinutes: 30 })]]),
        person("c", "Bob", null, [[d(2), day("late", { lateMinutes: 30 })]]),
      ]),
      { limit: 2 },
    );
    expect(tied.mostLate.map((p) => p.name)).toEqual(["Amy", "Bob"]);
  });

  it("names people with perfect attendance only when they attended and were never late or absent", () => {
    expect(report.perfect.map((p) => p.name)).toEqual(["Chand", "Esha"]);
    const onlyLeave = buildAttendanceReport(buildMonthGrid(M, [person("a", "Ana", null, [[d(2), day("leave_paid")]])]));
    expect(onlyLeave.perfect).toEqual([]);
  });

  it("gives null rates for an empty month", () => {
    const empty = buildAttendanceReport(buildMonthGrid(M, []));
    expect(empty.people).toBe(0);
    expect(empty.attendanceRate).toBeNull();
    expect(empty.punctualityRate).toBeNull();
    expect(empty.departments).toEqual([]);
    expect(empty.daily.every((p) => p.kind === "future")).toBe(true);
  });

  it("counts people who came in on a day off", () => {
    const worked = buildAttendanceReport(
      buildMonthGrid(M, [person("a", "Ana", null, [[d(7), day("weekly_off", { workedOnOffDay: true })]])]),
    );
    expect(worked.totals.workedOffDays).toBe(1);
  });
});

describe("formatRate", () => {
  it("rounds to a whole percent and shows a dash for no data", () => {
    expect(formatRate(0.9234)).toBe("92%");
    expect(formatRate(1)).toBe("100%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(null)).toBe("-");
  });
});
