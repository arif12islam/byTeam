import ExcelJS from "exceljs";

import { periodLabel } from "@/lib/period";
import { csvField } from "@/lib/reports/csv";
import { formatHoursMinutes } from "@/lib/time";

import { cellText } from "./labels";
import type { MonthGrid } from "./month";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ALL_TOTAL_HEADINGS = ["Present", "Late", "Absent", "Leave", "Late minutes", "Late (h:mm)", "No leaving punch", "Worked on days off"];
const NO_LEAVING_PUNCH = "No leaving punch";

/** Letters for the first column numbers: 1 is A, 27 is AA. */
function columnLetter(n: number): string {
  let out = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) out = String.fromCharCode(65 + ((i - 1) % 26)) + out;
  return out;
}

/**
 * The grid as an .xlsx file (a month or any period): one row per employee, one column per day
 * with the same codes as the screen, then the totals. Names go in as plain
 * text, never as formulas.
 */
export async function buildGridWorkbook(grid: MonthGrid, options: { trackLeavingPunch?: boolean; filterNote?: string | null } = {}): Promise<Buffer> {
  // An office that does not use the leaving punch has no such column and no ! in the legend.
  const trackLeaving = options.trackLeavingPunch !== false;
  const TOTAL_HEADINGS = ALL_TOTAL_HEADINGS.filter((h) => trackLeaving || h !== NO_LEAVING_PUNCH);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "byTeam";
  const sheet = workbook.addWorksheet(periodLabel({ from: grid.from, to: grid.to }), { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });

  // One month needs only the day number. A longer period says which month each day is in.
  const oneMonth = grid.from.slice(0, 7) === grid.to.slice(0, 7);
  const dayHeadings = grid.dates.map((date) => (oneMonth ? Number(date.slice(8)) : `${Number(date.slice(8))} ${monthNames[Number(date.slice(5, 7)) - 1]}`));
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
      formatHoursMinutes(totals.lateMinutes),
      ...(trackLeaving ? [totals.missingOut] : []),
      totals.workedOffDays,
    ]);
  }

  sheet.getColumn(1).width = 10;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 16;
  for (let i = 0; i < grid.dates.length; i++) {
    const column = sheet.getColumn(4 + i);
    column.width = oneMonth ? 4.5 : 7;
    column.alignment = { horizontal: "center" };
  }
  for (let i = 0; i < TOTAL_HEADINGS.length; i++) {
    const column = sheet.getColumn(4 + grid.dates.length + i);
    column.width = Math.max(10, TOTAL_HEADINGS[i].length + 2);
    column.alignment = { horizontal: "right" };
  }

  sheet.addRow([]);
  const notes = sheet.addRow([
    `P present, L late, A absent, PL paid leave, UL unpaid leave, W weekly off day, H holiday. ${trackLeaving ? "! no leaving punch, " : ""}* corrected by hand. Present counts late days too.`,
  ]);
  notes.getCell(1).font = { italic: true };
  sheet.mergeCells(`A${notes.number}:${columnLetter(3 + grid.dates.length + TOTAL_HEADINGS.length)}${notes.number}`);
  if (options.filterNote) {
    const filtered = sheet.addRow([options.filterNote]);
    filtered.getCell(1).font = { italic: true };
    sheet.mergeCells(`A${filtered.number}:${columnLetter(3 + grid.dates.length + TOTAL_HEADINGS.length)}${filtered.number}`);
  }

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}

/**
 * The grid as CSV: one row per employee, one column per day with the same
 * codes as the screen, then the totals. A cell starting with = + - or @ is
 * quoted so a spreadsheet cannot run it as a formula.
 */
export function buildGridCsv(grid: MonthGrid, options: { trackLeavingPunch?: boolean } = {}): string {
  const trackLeaving = options.trackLeavingPunch !== false;
  const totalHeadings = ALL_TOTAL_HEADINGS.filter((h) => trackLeaving || h !== NO_LEAVING_PUNCH);
  const lines = [["Code", "Name", "Department", ...grid.dates, ...totalHeadings].map(csvField).join(",")];
  for (const row of grid.rows) {
    const t = row.totals;
    lines.push(
      [
        row.employee.empCode,
        row.employee.name,
        row.employee.department,
        ...grid.dates.map((date) => {
          const cell = row.cells.get(date);
          return cell ? cellText(cell) : "";
        }),
        t.present,
        t.late,
        t.absent,
        t.leave,
        t.lateMinutes,
        formatHoursMinutes(t.lateMinutes),
        ...(trackLeaving ? [t.missingOut] : []),
        t.workedOffDays,
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
