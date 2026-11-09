import { describe, expect, it } from "vitest";

import { describeFilters, filterGrid, filterSlug, NO_DEPARTMENT, parseExportOptions } from "@/lib/attendance/export-options";
import { buildMonthGrid } from "@/lib/attendance/month";
import type { DayResult } from "@/lib/attendance/compute-day";

const day = (over: Partial<DayResult> = {}): DayResult => ({
  status: "present",
  firstIn: null,
  lastOut: null,
  lateMinutes: 0,
  earlyMinutes: 0,
  missingOut: false,
  workedOnOffDay: false,
  punchCount: 0,
  isManual: false,
  ...over,
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const grid = buildMonthGrid("2026-10", [
  { employee: { id: A, empCode: "1", name: "Ana", department: "Sales" }, days: [{ date: "2026-10-01", result: day({ status: "late", lateMinutes: 20 }) }] },
  { employee: { id: B, empCode: "2", name: "Bela", department: "Accounts" }, days: [{ date: "2026-10-01", result: day({ status: "absent" }) }, { date: "2026-10-02", result: day({ missingOut: true }) }] },
  { employee: { id: C, empCode: "3", name: "Chand", department: null }, days: [{ date: "2026-10-01", result: day({ status: "leave_paid" }) }] },
]);
const none = { department: null, employeeId: null, only: null } as const;
const names = (g: ReturnType<typeof filterGrid>) => g.rows.map((r) => r.employee.name);

describe("parseExportOptions", () => {
  it("defaults to Excel for everyone", () => {
    expect(parseExportOptions(new URLSearchParams(""))).toEqual({ format: "xlsx", department: null, employeeId: null, only: null });
  });

  it("reads each option", () => {
    const q = new URLSearchParams({ format: "pdf", department: " Sales ", employee: A, only: "late" });
    expect(parseExportOptions(q)).toEqual({ format: "pdf", department: "Sales", employeeId: A, only: "late" });
  });

  it("ignores a value that makes no sense instead of failing", () => {
    const q = new URLSearchParams({ format: "docx", employee: "not-an-id", only: "everything", department: "  " });
    expect(parseExportOptions(q)).toEqual({ format: "xlsx", department: null, employeeId: null, only: null });
  });
});

describe("filterGrid", () => {
  it("keeps everyone with no filter", () => {
    expect(names(filterGrid(grid, none))).toEqual(["Ana", "Bela", "Chand"]);
  });

  it("filters by department, including people with none", () => {
    expect(names(filterGrid(grid, { ...none, department: "Sales" }))).toEqual(["Ana"]);
    expect(names(filterGrid(grid, { ...none, department: NO_DEPARTMENT }))).toEqual(["Chand"]);
    expect(names(filterGrid(grid, { ...none, department: "Nobody here" }))).toEqual([]);
  });

  it("filters by one employee", () => {
    expect(names(filterGrid(grid, { ...none, employeeId: B }))).toEqual(["Bela"]);
  });

  it("keeps people with at least one such day", () => {
    expect(names(filterGrid(grid, { ...none, only: "late" }))).toEqual(["Ana"]);
    expect(names(filterGrid(grid, { ...none, only: "absent" }))).toEqual(["Bela"]);
    expect(names(filterGrid(grid, { ...none, only: "leave" }))).toEqual(["Chand"]);
    expect(names(filterGrid(grid, { ...none, only: "missing_out" }))).toEqual(["Bela"]);
    expect(names(filterGrid(grid, { ...none, only: "worked_off_day" }))).toEqual([]);
  });

  it("combines the filters and leaves the dates alone", () => {
    const filtered = filterGrid(grid, { department: "Accounts", employeeId: null, only: "absent" });
    expect(names(filtered)).toEqual(["Bela"]);
    expect(filtered.dates).toEqual(grid.dates);
    expect(names(filterGrid(grid, { department: "Sales", employeeId: null, only: "absent" }))).toEqual([]);
  });
});

describe("describeFilters and filterSlug", () => {
  it("says nothing when everyone is included", () => {
    expect(describeFilters(none)).toBeNull();
    expect(filterSlug(none)).toBeNull();
  });

  it("describes the filters in a sentence and a file name piece", () => {
    const options = { department: "Sales & Marketing", employeeId: A, only: "missing_out" } as const;
    expect(describeFilters(options, "Ana")).toBe("Filtered: department Sales & Marketing, employee Ana, only people who have a day with no leaving punch.");
    expect(filterSlug(options)).toBe("sales-marketing-one-person-missing-out");
    expect(describeFilters({ ...none, department: NO_DEPARTMENT })).toBe("Filtered: people with no department.");
  });
});
