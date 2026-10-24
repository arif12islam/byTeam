import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./columns";
import { employees, users } from "./setup";

/**
 * Leave categories such as casual, sick, annual or unpaid. The yearly quota is
 * a whole number of days, and null means no limit (what an unpaid type usually
 * wants). Types are switched off, never deleted, because requests refer to them.
 */
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    yearlyQuota: integer("yearly_quota"),
    /** Paid leave counts as paid days in payroll. Unpaid leave is deducted. */
    isPaid: boolean("is_paid").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // "Sick" and "sick" are the same type.
    uniqueIndex("leave_types_name_key").on(sql`lower(${t.name})`),
    check("leave_types_name_not_blank", sql`${t.name} ~ '\\S'`),
    check("leave_types_quota_not_negative", sql`${t.yearlyQuota} is null or ${t.yearlyQuota} >= 0`),
  ],
);

export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const leaveStatus = pgEnum("leave_status", LEAVE_STATUSES);

/**
 * One leave entry for an employee over a date range. HR enters and decides
 * them; there is no employee login. `days` counts working days in the range
 * (weekly off days and holidays are skipped) and is saved when the request is
 * made. `unpaid_days` is how many of those days, counted from the end of the
 * range, are recorded as unpaid because the balance ran out.
 */
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),
    /** First and last office date covered, both included. */
    fromDate: date("from_date", { mode: "string" }).notNull(),
    toDate: date("to_date", { mode: "string" }).notNull(),
    days: integer("days").notNull(),
    unpaidDays: integer("unpaid_days").notNull().default(0),
    status: leaveStatus("status").notNull().default("pending"),
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedBy: text("decided_by").references(() => users.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leave_requests_employee_dates_idx").on(t.employeeId, t.fromDate, t.toDate),
    index("leave_requests_status_idx").on(t.status, t.fromDate),
    check("leave_requests_dates_in_order", sql`${t.toDate} >= ${t.fromDate}`),
    check("leave_requests_days_positive", sql`${t.days} >= 1`),
    check("leave_requests_unpaid_within_days", sql`${t.unpaidDays} >= 0 and ${t.unpaidDays} <= ${t.days}`),
    // A decision records who made it and when, and a pending request has neither.
    check(
      "leave_requests_decision_recorded",
      sql`(${t.status} = 'pending' and ${t.decidedBy} is null and ${t.decidedAt} is null) or (${t.status} <> 'pending' and ${t.decidedBy} is not null and ${t.decidedAt} is not null)`,
    ),
  ],
);
