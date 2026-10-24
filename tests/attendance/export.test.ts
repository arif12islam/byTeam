import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import { buildGridWorkbook } from "@/lib/attendance/export";
import { buildMonthGrid, buildPeriodGrid } from "@/lib/attendance/month";

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

async function read(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe("buildGridWorkbook", () => {
  const grid = buildMonthGrid("2026-10", [
    {
      employee: { id: "b", empCode: "20", name: "Bela", department: "Sales" },
      days: [
        { date: "2026-10-01", result: day({ status: "present" }) },
        { date: "2026-10-02", result: day({ status: "late", lateMinutes: 25, missingOut: true }) },
        { date: "2026-10-03", result: day({ status: "absent", isManual: true }) },
        { date: "2026-10-04", result: day({ status: "leave_paid" }) },
      ],
    },
    { employee: { id: "a", empCode: "10", name: "=1+1", department: null }, days: [] },
  ]);

  it("writes one sheet named for the month, a header row and a row per employee in grid order", async () => {
    const workbook = await read(await buildGridWorkbook(grid));
    expect(workbook.worksheets).toHaveLength(1);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("Oct 2026");

    const header = sheet.getRow(1).values as unknown[];
    expect(header.slice(1, 7)).toEqual(["Code", "Name", "Department", 1, 2, 3]);
    expect(header[3 + 31 + 1]).toBe("Present"); // after 31 day columns
    expect(sheet.getRow(2).getCell(2).value).toBe("=1+1");
    expect(sheet.getRow(3).getCell(2).value).toBe("Bela");
  });

  it("uses the same codes as the screen and puts the totals after the days", async () => {
    const sheet = (await read(await buildGridWorkbook(grid))).worksheets[0];
    const bela = sheet.getRow(3);
    expect([4, 5, 6, 7, 8].map((c) => bela.getCell(c).value)).toEqual(["P", "L!", "A*", "PL", null].map((v) => v ?? ""));
    const firstTotal = 4 + 31;
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => bela.getCell(firstTotal + i).value)).toEqual([2, 1, 1, 1, 25, 1, 0]);
  });

  it("keeps a name that looks like a formula as text", async () => {
    const sheet = (await read(await buildGridWorkbook(grid))).worksheets[0];
    const cell = sheet.getRow(2).getCell(2);
    expect(typeof cell.value).toBe("string");
    expect(cell.formula).toBeUndefined();
  });

  it("still gives a valid file for an empty month", async () => {
    const sheet = (await read(await buildGridWorkbook(buildMonthGrid("2026-02", [])))).worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe("Code");
    expect(sheet.rowCount).toBeGreaterThanOrEqual(1);
  });

  it("writes a longer period with the month in each day heading and a sheet named for the period", async () => {
    const period = { from: "2026-08-30", to: "2026-09-02" };
    const multi = buildPeriodGrid(period, [
      {
        employee: { id: "a", empCode: "10", name: "Ana", department: null },
        days: [
          { date: "2026-08-31", result: day({ status: "present" }) },
          { date: "2026-09-01", result: day({ status: "late", lateMinutes: 12 }) },
        ],
      },
    ]);
    const sheet = (await read(await buildGridWorkbook(multi))).worksheets[0];
    expect(sheet.name).toBe("30 Aug to 2 Sep 2026");
    const header = sheet.getRow(1).values as unknown[];
    expect(header.slice(1, 8)).toEqual(["Code", "Name", "Department", "30 Aug", "31 Aug", "1 Sep", "2 Sep"]);
    const row = sheet.getRow(2).values as unknown[];
    expect(row.slice(4, 8)).toEqual(["", "P", "L", ""]);
    expect(row[8]).toBe(2); // present, late days included
    expect(row[9]).toBe(1); // late
  });
});
