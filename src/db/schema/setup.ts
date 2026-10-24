import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./columns";

export const USER_ROLES = ["owner", "hr"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const userRole = pgEnum("user_role", USER_ROLES);

/**
 * Admin logins. The shape follows what Better Auth expects of a user table
 * (text id, name, email, email_verified, image) plus our role. Better Auth
 * keeps the password hash in its own account table, added with the auth setup.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("hr"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * One row of company config, enforced by the id check. Weekly off days use
 * 0 for Sunday to 6 for Saturday. They start empty because the office has not
 * decided them yet (docs/BUILD_PLAN.md section 7).
 */
export const LEAVE_YEAR_BASES = ["calendar", "anniversary"] as const;
export type LeaveYearBasis = (typeof LEAVE_YEAR_BASES)[number];

export const leaveYearBasis = pgEnum("leave_year_basis", LEAVE_YEAR_BASES);

export const companySettings = pgTable(
  "company_settings",
  {
    id: smallint("id").primaryKey().default(1),
    name: text("name").notNull().default(""),
    weeklyOffDays: smallint("weekly_off_days")
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
    timezone: text("timezone").notNull().default("Asia/Dhaka"),
    currency: text("currency").notNull().default("BDT"),
    /**
     * Which year a leave quota counts in: the calendar year (January to
     * December) or each employee's own year starting on their joining date.
     * The office has not decided (docs/BUILD_PLAN.md section 7), so it starts
     * as the calendar year and can be changed.
     */
    leaveYearBasis: leaveYearBasis("leave_year_basis").notNull().default("calendar"),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("company_settings_single_row", sql`${t.id} = 1`),
    check("company_settings_off_days_range", sql`${t.weeklyOffDays} <@ ARRAY[0,1,2,3,4,5,6]::smallint[]`),
  ],
);

/** Public holiday calendar, one row per date. */
export const holidays = pgTable("holidays", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date", { mode: "string" }).notNull().unique(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

/** Working hours. Night shifts are out of scope, so end is after start. */
export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    graceMinutes: integer("grace_minutes").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("shifts_end_after_start", sql`${t.endTime} > ${t.startTime}`),
    check("shifts_grace_not_negative", sql`${t.graceMinutes} >= 0`),
  ],
);

/** Staff records. emp_code is the PIN on the device, so it is unique. */
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empCode: text("emp_code").notNull().unique(),
    name: text("name").notNull(),
    department: text("department"),
    designation: text("designation"),
    joinDate: date("join_date", { mode: "string" }).notNull(),
    exitDate: date("exit_date", { mode: "string" }),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("employees_exit_not_before_join", sql`${t.exitDate} is null or ${t.exitDate} >= ${t.joinDate}`),
    index("employees_shift_id_idx").on(t.shiftId),
  ],
);

/**
 * Pay per employee, versioned. The row in force for a month is the one with
 * the latest effective_from on or before that month. effective_from is always
 * the first day of a month. The percentages split gross into components.
 */
export const salaryStructures = pgTable(
  "salary_structures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    gross: numeric("gross", { precision: 12, scale: 2 }).notNull(),
    basicPct: numeric("basic_pct", { precision: 5, scale: 2 }).notNull(),
    housePct: numeric("house_pct", { precision: 5, scale: 2 }).notNull(),
    medicalPct: numeric("medical_pct", { precision: 5, scale: 2 }).notNull(),
    conveyancePct: numeric("conveyance_pct", { precision: 5, scale: 2 }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("salary_structures_employee_effective_from_key").on(t.employeeId, t.effectiveFrom),
    check("salary_structures_effective_from_month_start", sql`extract(day from ${t.effectiveFrom}) = 1`),
    check("salary_structures_gross_not_negative", sql`${t.gross} >= 0`),
    check(
      "salary_structures_pct_range",
      sql`${t.basicPct} between 0 and 100
        and ${t.housePct} between 0 and 100
        and ${t.medicalPct} between 0 and 100
        and ${t.conveyancePct} between 0 and 100
        and ${t.basicPct} + ${t.housePct} + ${t.medicalPct} + ${t.conveyancePct} <= 100`,
    ),
  ],
);

/**
 * Who changed what. Rows are only ever inserted. actor_id is null for changes
 * made by scripts, such as the owner seed.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity, t.entityId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);
