import ExcelJS from "exceljs";

import { formatMonth } from "@/lib/time";

import { cellText } from "./labels";
import type { MonthGrid } from "./month";

const TOTAL_HEADINGS = ["Present", "Late", "Absent", "Leave", "Late minutes", "No leaving punch", "Worked on days off"];

/** Letters for the first column numbers: 1 is A, 27 is AA. */
function columnLetter(n: number): string {
  let out = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) out = String.fromCharCode(65 + ((i - 1) % 26)) + out;
  return out;
}

/**
 * The monthly grid as an .xlsx file: one row per employee, one column per day
 * with the same codes as the screen, then the totals. Names go in as plain
 * text, never as formulas.
 */
export async function buildGridWorkbook(grid: MonthGrid): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "byTeam";
  const sheet = workbook.addWorksheet(formatMonth(grid.month), { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });

  const dayHeadings = grid.dates.map((date) => Number(date.slice(8)));
  const header = sheet.addRow(["Code", "Name", "Department", ...dayHeadings, ...TOTAL_HEADINGS]);
  header.font = { bold: true };

  for (const row of grid.rows) {
    const { totals } = row;
    sheet.addRow([
      row.employee.empCode,
      row.employee.name,
      row.employee.department ?? "",
      ...grid.dates.map((date) => {
        const cell = row.cells.get(date);
        return cell ? cellText(cell) : "";
      }),
      totals.present,
      totals.late,
      totals.absent,
      totals.leave,
      totals.lateMinutes,
      totals.missingOut,
      totals.workedOffDays,
    ]);
  }

  sheet.getColumn(1).width = 10;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 16;
  for (let i = 0; i < grid.dates.length; i++) {
    const column = sheet.getColumn(4 + i);
    column.width = 4.5;
    column.alignment = { horizontal: "center" };
  }
  for (let i = 0; i < TOTAL_HEADINGS.length; i++) {
    const column = sheet.getColumn(4 + grid.dates.length + i);
    column.width = Math.max(10, TOTAL_HEADINGS[i].length + 2);
    column.alignment = { horizontal: "right" };
  }

  sheet.addRow([]);
  const notes = sheet.addRow([
    "P present, L late, A absent, PL paid leave, UL unpaid leave, W weekly off day, H holiday. ! no leaving punch, * corrected by hand. Present counts late days too.",
  ]);
  notes.getCell(1).font = { italic: true };
  sheet.mergeCells(`A${notes.number}:${columnLetter(3 + grid.dates.length + TOTAL_HEADINGS.length)}${notes.number}`);

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}
