import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/db/schema/attendance";

import type { DayOverrides } from "./compute-day";

/** One row of attendance_adjustments, as far as turning it into an override needs. */
export type AdjustmentRow = {
  field: "status" | "first_in" | "last_out";
  newValue: string | null;
  createdAt: Date;
};

/**
 * The overrides in force for one day. For each field the newest adjustment
 * wins, and a newest adjustment with no value clears the override so the
 * computed value applies again. A value that cannot be read is treated as not
 * set: adjustments are validated when they are written, so this is only a guard.
 */
export function effectiveOverrides(rows: readonly AdjustmentRow[]): DayOverrides {
  const newest = new Map<string, AdjustmentRow>();
  // Stable: rows with the same time keep the order they were given in, later ones winning.
  [...rows]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.createdAt.getTime() - b.row.createdAt.getTime() || a.index - b.index)
    .forEach(({ row }) => newest.set(row.field, row));

  const overrides: DayOverrides = {};

  const status = newest.get("status")?.newValue;
  if (status && (ATTENDANCE_STATUSES as readonly string[]).includes(status)) {
    overrides.status = status as AttendanceStatus;
  }
  for (const [field, key] of [["first_in", "firstIn"], ["last_out", "lastOut"]] as const) {
    const value = newest.get(field)?.newValue;
    if (!value) continue;
    const instant = new Date(value);
    if (!Number.isNaN(instant.getTime())) overrides[key] = instant;
  }
  return overrides;
}
