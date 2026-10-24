import type { MonthGrid } from "@/lib/attendance/month";

/** One field of a CSV line. Quotes it when it holds a comma, quote or line break. */
export function csvField(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  // A cell that starts with = + - @ can run as a formula when the file is opened in a spreadsheet.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADER = ["Code", "Name", "Department", "Days present", "Days late", "Days absent", "Days on leave", "Minutes late", "Missing leaving punch", "Net pay"];

/**
 * The period as a CSV, one line per employee. `netByEmployee` holds each
 * person's net pay as text when a payroll run exists for the month.
 */
export function buildReportCsv(grid: MonthGrid, netByEmployee: ReadonlyMap<string, string> = new Map()): string {
  const lines = [HEADER.map(csvField).join(",")];
  for (const row of grid.rows) {
    const t = row.totals;
    lines.push(
      [
        row.employee.empCode,
        row.employee.name,
        row.employee.department,
        t.present,
        t.late,
        t.absent,
        t.leave,
        t.lateMinutes,
        t.missingOut,
        netByEmployee.get(row.employee.id) ?? null,
      ]
        .map(csvField)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
