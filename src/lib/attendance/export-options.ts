import { z } from "zod";

import type { GridRow, PeriodGrid } from "./month";

export const EXPORT_FORMATS = ["xlsx", "pdf", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** "Only people who ..." choices: a person stays in when they have at least one such day in the period. */
export const ONLY_CHOICES = ["late", "absent", "leave", "missing_out", "worked_off_day"] as const;
export type OnlyChoice = (typeof ONLY_CHOICES)[number];

export const ONLY_LABELS: Record<OnlyChoice, string> = {
  late: "were late",
  absent: "were absent",
  leave: "took leave",
  missing_out: "have a day with no leaving punch",
  worked_off_day: "worked on a day off",
};

/** The department choice that means people with no department. */
export const NO_DEPARTMENT = "__none";

export type ExportOptions = {
  format: ExportFormat;
  /** A department name, NO_DEPARTMENT, or null for everyone. */
  department: string | null;
  employeeId: string | null;
  only: OnlyChoice | null;
};

const text = (value: string | null) => (value === null || value.trim() === "" ? null : value.trim());

/** Reads the options from the download link. A value that makes no sense is ignored, never an error. */
export function parseExportOptions(query: URLSearchParams): ExportOptions {
  const format = EXPORT_FORMATS.find((f) => f === query.get("format")) ?? "xlsx";
  const only = ONLY_CHOICES.find((o) => o === query.get("only")) ?? null;
  const employee = z.uuid().safeParse(text(query.get("employee")));
  return { format, department: text(query.get("department")), employeeId: employee.success ? employee.data : null, only };
}

function hasDay(row: GridRow, only: OnlyChoice): boolean {
  const t = row.totals;
  switch (only) {
    case "late":
      return t.late > 0;
    case "absent":
      return t.absent > 0;
    case "leave":
      return t.leave > 0;
    case "missing_out":
      return t.missingOut > 0;
    case "worked_off_day":
      return t.workedOffDays > 0;
  }
}

/** The same grid with only the people the options keep, in the same order. Pure. */
export function filterGrid(grid: PeriodGrid, options: Pick<ExportOptions, "department" | "employeeId" | "only">): PeriodGrid {
  const rows = grid.rows.filter((row) => {
    if (options.employeeId !== null && row.employee.id !== options.employeeId) return false;
    if (options.department === NO_DEPARTMENT && row.employee.department !== null) return false;
    if (options.department !== null && options.department !== NO_DEPARTMENT && row.employee.department !== options.department) return false;
    if (options.only !== null && !hasDay(row, options.only)) return false;
    return true;
  });
  return { ...grid, rows };
}

/** The filters in a sentence for the file, or null when everyone is included. */
export function describeFilters(options: Pick<ExportOptions, "department" | "employeeId" | "only">, employeeName: string | null = null): string | null {
  const parts: string[] = [];
  if (options.department === NO_DEPARTMENT) parts.push("people with no department");
  else if (options.department !== null) parts.push(`department ${options.department}`);
  if (options.employeeId !== null) parts.push(employeeName ? `employee ${employeeName}` : "one employee");
  if (options.only !== null) parts.push(`only people who ${ONLY_LABELS[options.only]}`);
  return parts.length === 0 ? null : `Filtered: ${parts.join(", ")}.`;
}

/** A short piece for the file name, like "sales" or "late", or null for no filter. */
export function filterSlug(options: Pick<ExportOptions, "department" | "employeeId" | "only">): string | null {
  const parts: string[] = [];
  if (options.department === NO_DEPARTMENT) parts.push("no-department");
  else if (options.department !== null) parts.push(options.department.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  if (options.employeeId !== null) parts.push("one-person");
  if (options.only !== null) parts.push(options.only.replace("_", "-"));
  const slug = parts.filter(Boolean).join("-");
  return slug === "" ? null : slug.slice(0, 40);
}
