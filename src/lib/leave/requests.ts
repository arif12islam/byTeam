import { and, asc, between, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { companySettings, employees, holidays, leaveRequests, leaveTypes, type LeaveStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { finalizedMonthsBetween, lockedMessage } from "@/lib/payroll/lock";
import { formatOfficeDate, isValidOfficeDate } from "@/lib/time";

import { MAX_LEAVE_RANGE_DAYS, leaveWorkingDates, type CalendarForLeave } from "./days";

type Db = ReturnType<typeof getDb>;
type Reader = Pick<Db, "select">;

export const leaveRequestSchema = z.object({
  employeeId: z.uuid("Choose an employee."),
  leaveTypeId: z.uuid("Choose a leave type."),
  fromDate: z.string().refine(isValidOfficeDate, "Enter the first day of leave."),
  toDate: z.string().refine(isValidOfficeDate, "Enter the last day of leave."),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters.")
    .nullish()
    .transform((v) => (v ? v : null)),
});

export type LeaveRequestInput = z.input<typeof leaveRequestSchema>;

/** Weekly off days and the holidays inside a date range: what decides which days leave really uses. */
export async function loadLeaveCalendar(db: Reader, from: string, to: string): Promise<CalendarForLeave> {
  const [settings] = await db.select({ days: companySettings.weeklyOffDays }).from(companySettings).where(eq(companySettings.id, 1));
  const rows = await db.select({ date: holidays.date }).from(holidays).where(between(holidays.date, from, to));
  return { weeklyOffDays: settings?.days ?? [], holidayDates: new Set(rows.map((r) => r.date)) };
}

export type CreateLeaveResult =
  | { ok: true; requestId: string; days: number }
  | { ok: false; error: string };

/**
 * Records a leave request on an employee's behalf. It starts as pending; the
 * approval step (and the balance check) comes after. The day count is saved
 * with the request and skips weekly off days and holidays. Past dates are fine,
 * because HR often records leave after it happened.
 *
 * Refuses: dates in a month whose payroll is finalized, an unknown or former employee, an unknown or switched-off type,
 * dates outside the person's time at the company, a range longer than a year,
 * a range of only days off, and dates that overlap a pending or approved
 * request for the same person.
 */
export async function createLeaveRequest(db: Db, input: LeaveRequestInput, actorId: string): Promise<CreateLeaveResult> {
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { employeeId, leaveTypeId, fromDate, toDate, note } = parsed.data;

  if (toDate < fromDate) return { ok: false, error: "The last day cannot be before the first day." };
  const span = (Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000 + 1;
  if (span > MAX_LEAVE_RANGE_DAYS) return { ok: false, error: `One request can cover at most ${MAX_LEAVE_RANGE_DAYS} days. Split it into two.` };

  return db.transaction(async (tx): Promise<CreateLeaveResult> => {
    const locked = await finalizedMonthsBetween(tx, fromDate, toDate, { lock: true });
    if (locked.size > 0) return { ok: false, error: lockedMessage(locked, "leave in those dates") };

    const [person] = await tx.select().from(employees).where(eq(employees.id, employeeId));
    if (!person) return { ok: false, error: "That employee no longer exists." };
    if (!person.active) return { ok: false, error: "That employee is no longer active." };
    if (fromDate < person.joinDate) return { ok: false, error: `${person.name} joined on ${formatOfficeDate(person.joinDate)}. Leave cannot start before that.` };
    if (person.exitDate !== null && toDate > person.exitDate) {
      return { ok: false, error: `${person.name} leaves on ${formatOfficeDate(person.exitDate)}. Leave cannot run past that.` };
    }

    const [type] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, leaveTypeId));
    if (!type) return { ok: false, error: "That leave type no longer exists." };
    if (!type.active) return { ok: false, error: `${type.name} is not in use. Choose another type, or switch it back on under Leave types.` };

    const calendar = await loadLeaveCalendar(tx, fromDate, toDate);
    const days = leaveWorkingDates(fromDate, toDate, calendar).length;
    if (days === 0) return { ok: false, error: "Those dates are all days off, so there is no leave to record." };

    const [clash] = await tx
      .select({ fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, status: leaveRequests.status })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.employeeId, employeeId),
          inArray(leaveRequests.status, ["pending", "approved"]),
          lte(leaveRequests.fromDate, toDate),
          gte(leaveRequests.toDate, fromDate),
        ),
      )
      .limit(1);
    if (clash) {
      const when = clash.fromDate === clash.toDate ? formatOfficeDate(clash.fromDate) : `${formatOfficeDate(clash.fromDate)} to ${formatOfficeDate(clash.toDate)}`;
      return { ok: false, error: `${person.name} already has ${clash.status === "approved" ? "approved" : "pending"} leave on ${when}.` };
    }

    const [row] = await tx.insert(leaveRequests).values({ employeeId, leaveTypeId, fromDate, toDate, days, note, createdBy: actorId }).returning();
    await audit(tx, { actorId, action: "leave.create", entity: "leave_request", entityId: row.id, after: row });
    return { ok: true, requestId: row.id, days };
  });
}

export type LeaveRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  empCode: string;
  leaveTypeId: string;
  leaveTypeName: string;
  isPaid: boolean;
  fromDate: string;
  toDate: string;
  days: number;
  unpaidDays: number;
  status: LeaveStatus;
  note: string | null;
  createdAt: Date;
};

/** Pending requests first, then the newest leave. */
export async function listLeaveRequests(db: Db, options: { status?: LeaveStatus; employeeId?: string; limit?: number } = {}): Promise<LeaveRequestRow[]> {
  return db
    .select({
      id: leaveRequests.id,
      employeeId: leaveRequests.employeeId,
      employeeName: employees.name,
      empCode: employees.empCode,
      leaveTypeId: leaveRequests.leaveTypeId,
      leaveTypeName: leaveTypes.name,
      isPaid: leaveTypes.isPaid,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      days: leaveRequests.days,
      unpaidDays: leaveRequests.unpaidDays,
      status: leaveRequests.status,
      note: leaveRequests.note,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        options.status ? eq(leaveRequests.status, options.status) : undefined,
        options.employeeId ? eq(leaveRequests.employeeId, options.employeeId) : undefined,
      ),
    )
    .orderBy(sql`(${leaveRequests.status} = 'pending') desc`, desc(leaveRequests.fromDate), asc(employees.name))
    .limit(options.limit ?? 200);
}
