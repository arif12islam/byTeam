import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import { buildMonthGrid, totalsOf, type GridCell } from "@/lib/attendance/month";

const day = (overrides: Partial<DayResult>): DayResult => ({
  status: "present",
  firstIn: null,
  lastOut: null,
  lateMinutes: 0,
  earlyMinutes: 0,
  missingOut: false,
  workedOnOffDay: false,
  punchCount: 0,
  isManual: false,
  ...overrides,
});

const cell = (overrides: Partial<GridCell>): GridCell => ({
  status: "present",
  lateMinutes: 0,
  earlyMinutes: 0,
  missingOut: false,
  workedOnOffDay: false,
  isManual: false,
  ...overrides,
});

describe("totalsOf", () => {
  it("counts late days as present days too, and adds up late minutes", () => {
    expect(
      totalsOf([
        cell({ status: "present" }),
        cell({ status: "late", lateMinutes: 25 }),
        cell({ status: "late", lateMinutes: 10, missingOut: true }),
        cell({ status: "absent" }),
        cell({ status: "leave_paid" }),
        cell({ status: "leave_unpaid" }),
        cell({ status: "weekly_off" }),
        cell({ status: "holiday", workedOnOffDay: true, missingOut: true }),
      ]),
    ).toEqual({ present: 3, late: 2, absent: 1, leave: 2, missingOut: 2, workedOffDays: 1, lateMinutes: 35 });
  });

  it("is all zeros for an empty month", () => {
    expect(totalsOf([])).toEqual({ present: 0, late: 0, absent: 0, leave: 0, missingOut: 0, workedOffDays: 0, lateMinutes: 0 });
  });
});

describe("buildMonthGrid", () => {
  const ana = { id: "a", empCode: "1", name: "Ana", department: null };
  const bela = { id: "b", empCode: "2", name: "Bela", department: null };

  it("lists every date of the month, sorted rows, and leaves days without a result out of the cells", () => {
    const grid = buildMonthGrid("2028-02", [
      { employee: bela, days: [{ date: "2028-02-03", result: day({ status: "absent" }) }] },
      { employee: ana, days: [{ date: "2028-02-01", result: day({ status: "late", lateMinutes: 12 }) }] },
    ]);
    expect(grid.dates).toHaveLength(29); // 2028 is a leap year
    expect(grid.dates[0]).toBe("2028-02-01");
    expect(grid.dates[28]).toBe("2028-02-29");
    expect(grid.rows.map((r) => r.employee.name)).toEqual(["Ana", "Bela"]);
    expect(grid.rows[0].cells.get("2028-02-01")).toMatchObject({ status: "late", lateMinutes: 12 });
    expect(grid.rows[0].cells.has("2028-02-02")).toBe(false);
    expect(grid.rows[0].totals).toMatchObject({ present: 1, late: 1, lateMinutes: 12 });
    expect(grid.rows[1].totals.absent).toBe(1);
  });

  it("has no rows when nobody was employed", () => {
    expect(buildMonthGrid("2026-10", []).rows).toEqual([]);
  });
});
