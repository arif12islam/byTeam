import ExcelJS from "exceljs";

import { formatMonth } from "@/lib/time";

import type { Sheet } from "./runs";

const HEADINGS = ["Code", "Name", "Department", "Days paid", "Absent", "Late", "Unpaid leave", "Gross earned", "Deductions", "Additions", "Net pay"];
const MONEY_FORMAT = "#,##0.00";

/** An amount text like "1234.50" as a number the spreadsheet can add up. */
const amount = (text: string) => Number(text);

/**
 * The finalized salary sheet as an .xlsx file for the bank or bKash: one row per
 * person with their net pay, and a total row. Amounts are real numbers, so the
 * file can be summed and sorted. Names go in as plain text, never as formulas.
 */
export async function buildSalaryWorkbook(sheet: Sheet): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "byTeam";
  const month = formatMonth(sheet.run.month);
  const worksheet = workbook.addWorksheet(`Salary ${month}`, { views: [{ state: "frozen", ySplit: 1 }] });

  const header = worksheet.addRow(HEADINGS);
  header.font = { bold: true };

  for (const row of sheet.rows) {
    worksheet.addRow([
      row.empCode,
      row.name,
      row.department ?? "",
      row.payableDays,
      row.absentDays,
      row.lateCount,
      row.unpaidLeaveDays,
      amount(row.gross),
      amount(row.deductions),
      amount(row.additions),
      amount(row.net),
    ]);
  }

  const total = worksheet.addRow(["", "Total", "", "", "", "", "", amount(sheet.totals.gross), amount(sheet.totals.deductions), amount(sheet.totals.additions), amount(sheet.totals.net)]);
  total.font = { bold: true };

  worksheet.getColumn(1).width = 10;
  worksheet.getColumn(2).width = 26;
  worksheet.getColumn(3).width = 16;
  for (let i = 4; i <= 7; i++) worksheet.getColumn(i).width = 12;
  for (let i = 8; i <= 11; i++) {
    const column = worksheet.getColumn(i);
    column.width = 15;
    column.numFmt = MONEY_FORMAT;
    column.alignment = { horizontal: "right" };
  }

  worksheet.addRow([]);
  const note = worksheet.addRow([`Payroll for ${month}, version ${sheet.run.version}. Net pay is rounded to a whole taka.`]);
  note.getCell(1).font = { italic: true };
  worksheet.mergeCells(`A${note.number}:K${note.number}`);

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}
