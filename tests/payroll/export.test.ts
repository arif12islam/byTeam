import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildSalaryWorkbook } from "@/lib/payroll/export";
import type { Sheet, SheetRow } from "@/lib/payroll/runs";

const row = (over: Partial<SheetRow>): SheetRow => ({
  employeeId: "id",
  empCode: "1",
  name: "Name",
  department: "Sales",
  payableDays: 30,
  absentDays: 0,
  lateCount: 0,
  unpaidLeaveDays: 0,
  gross: "30000.00",
  deductions: "0.00",
  additions: "0.00",
  net: "30000.00",
  warnings: [],
  lines: [],
  ...over,
});

const sheet: Sheet = {
  run: { id: "run", month: "2026-10", status: "finalized", version: 2, updatedAt: new Date(), finalizedAt: new Date(), finalizedByName: "Owner" },
  rows: [
    row({ empCode: "10", name: "Rahim Uddin", gross: "130000.50", deductions: "17727.33", additions: "5000.00", net: "117273.00", absentDays: 1, lateCount: 3, unpaidLeaveDays: 1 }),
    row({ empCode: "20", name: "=HYPERLINK(\"http://example.test\")", department: null, payableDays: 12, gross: "9290.32", deductions: "1142.86", net: "8148.00" }),
  ],
  totals: { gross: "139290.82", deductions: "18870.19", additions: "5000.00", net: "125421.00" },
  skipped: [],
  notices: [],
  adjustments: [],
};

async function read(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe("buildSalaryWorkbook", () => {
  it("has a heading row, one row per person, and a total row", async () => {
    const workbook = await read(await buildSalaryWorkbook(sheet));
    const ws = workbook.worksheets[0];
    expect(ws.name).toBe("Salary Oct 2026");
    expect(ws.getRow(1).values).toEqual([
      undefined, "Code", "Name", "Department", "Days paid", "Absent", "Late", "Unpaid leave", "Gross earned", "Deductions", "Additions", "Net pay",
    ]);
    expect(ws.getRow(2).values).toEqual([undefined, "10", "Rahim Uddin", "Sales", 30, 1, 3, 1, 130000.5, 17727.33, 5000, 117273]);
    expect(ws.getRow(3).getCell(3).value).toBe(""); // no department
    expect(ws.getRow(4).values).toEqual([undefined, "", "Total", "", "", "", "", "", 139290.82, 18870.19, 5000, 125421]);
  });

  it("stores amounts as numbers that add up, with a money format", async () => {
    const ws = (await read(await buildSalaryWorkbook(sheet))).worksheets[0];
    const net = [ws.getRow(2).getCell(11).value, ws.getRow(3).getCell(11).value] as number[];
    expect(net.every((n) => typeof n === "number")).toBe(true);
    expect(net.reduce((a, b) => a + b, 0)).toBe(Number(sheet.totals.net));
    expect(ws.getColumn(11).numFmt).toBe("#,##0.00");
  });

  it("keeps a name that looks like a formula as plain text", async () => {
    const ws = (await read(await buildSalaryWorkbook(sheet))).worksheets[0];
    const cell = ws.getRow(3).getCell(2);
    expect(cell.value).toBe('=HYPERLINK("http://example.test")');
    expect(cell.type).toBe(ExcelJS.ValueType.String);
  });

  it("says which payroll version it came from", async () => {
    const ws = (await read(await buildSalaryWorkbook(sheet))).worksheets[0];
    expect(ws.getRow(6).getCell(1).value).toBe("Payroll for Oct 2026, version 2. Net pay is rounded to a whole taka.");
  });

  it("works with nobody in the sheet", async () => {
    const empty = { ...sheet, rows: [], totals: { gross: "0.00", deductions: "0.00", additions: "0.00", net: "0.00" } };
    const ws = (await read(await buildSalaryWorkbook(empty))).worksheets[0];
    expect(ws.getRow(2).getCell(2).value).toBe("Total");
  });
});
