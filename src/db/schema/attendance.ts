import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { createdAt } from "./columns";
import { employees, users } from "./setup";

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
  "leave_paid",
  "leave_unpaid",
  "weekly_off",
  "holiday",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendanceStatus = pgEnum("attendance_status", ATTENDANCE_STATUSES);

/**
 * One computed row per employee per day, rebuilt from punches, shifts, the
 * calendar, leave and adjustments. Derived data: it can be deleted and
 * recomputed at any time. Days before the join date or after the exit date
 * have no row.
 */
export const attendanceDays = pgTable(
  "attendance_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    /** The office date, Asia/Dhaka. */
    date: date("date", { mode: "string" }).notNull(),
    firstIn: timestamp("first_in", { withTimezone: true }),
    lastOut: timestamp("last_out", { withTimezone: true }),
    status: attendanceStatus("status").notNull(),
    lateMinutes: integer("late_minutes").notNull().default(0),
    earlyMinutes: integer("early_minutes").notNull().default(0),
    /** Only one punch that day, so there is an arrival but no departure. */
    missingOut: boolean("missing_out").notNull().default(false),
    /** Punches on a weekly off day or a holiday. The day keeps its type. */
    workedOnOffDay: boolean("worked_on_off_day").notNull().default(false),
    punchCount: integer("punch_count").notNull().default(0),
    /** A manual adjustment changed something on this day. */
    isManual: boolean("is_manual").notNull().default(false),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("attendance_days_employee_date_key").on(t.employeeId, t.date),
    index("attendance_days_date_idx").on(t.date, t.status),
    check("attendance_days_minutes_not_negative", sql`${t.lateMinutes} >= 0 and ${t.earlyMinutes} >= 0`),
  ],
);

export const ADJUSTMENT_FIELDS = ["status", "first_in", "last_out"] as const;
export type AdjustmentField = (typeof ADJUSTMENT_FIELDS)[number];

export const adjustmentField = pgEnum("attendance_adjustment_field", ADJUSTMENT_FIELDS);

/**
 * Manual fixes on top of the computed day. Never edited or removed: a new row
 * is added instead, and the newest row for an employee, date and field wins.
 * A newest row with no new_value clears the override and the computed value
 * applies again. new_value is a status name for the status field, and an ISO
 * date and time for first_in and last_out.
 */
export const attendanceAdjustments = pgTable(
  "attendance_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    field: adjustmentField("field").notNull(),
    newValue: text("new_value"),
    reason: text("reason").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("attendance_adjustments_lookup_idx").on(t.employeeId, t.date, t.field, t.createdAt),
    // btrim only trims spaces, so test for any character that is not whitespace, tabs and line breaks included.
    check("attendance_adjustments_reason_not_blank", sql`${t.reason} ~ '\\S'`),
  ],
);
