import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { attendanceAdjustments, attendanceDays, employees } from "@/db/schema";
import { ADJUSTMENT_FIELDS, ATTENDANCE_STATUSES } from "@/db/schema/attendance";
import { audit } from "@/lib/audit";
import { isValidOfficeDate, officeDateTimeToInstant, timeToMinutes, toOfficeDate } from "@/lib/time";

import { recalcDay } from "./triggers";

type Db = ReturnType<typeof getDb>;

export const adjustmentSchema = z
  .object({
    employeeId: z.uuid("Choose an employee."),
    date: z.string().refine(isValidOfficeDate, "Choose a valid date."),
    field: z.enum(ADJUSTMENT_FIELDS, "Choose what to change."),
    /** A status name, or a time of day "HH:MM" on that date in the office time zone. Empty removes the earlier change. */
    value: z
      .string()
      .trim()
      .nullish()
      .transform((v) => (v === undefined || v === null || v === "" ? null : v)),
    reason: z.string().trim().min(3, "Say why you are changing this, in a few words.").max(500, "Keep the reason under 500 characters."),
  })
  .superRefine((a, ctx) => {
    if (a.value === null) return;
    if (a.field === "status" && !(ATTENDANCE_STATUSES as readonly string[]).includes(a.value)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Choose a status from the list." });
    }
    if (a.field !== "status" && timeToMinutes(a.value) === null) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a time like 09:30." });
    }
  });

export type AdjustmentInput = z.input<typeof adjustmentSchema>;
export type AdjustmentResult = { ok: true } | { ok: false; error: string };

/**
 * Saves a manual change to one day, keeping the history: a new row is added
 * and nothing is edited. A reason is required. The day is recomputed straight
 * away, and an audit row records who changed what and why. An empty value
 * removes the earlier change so the computed value applies again.
 *
 * Refuses a day that has not happened yet, a date outside the person's
 * employment, and a leaving time that is not after the arrival.
 */
export async function addAdjustment(
  db: Db,
  input: AdjustmentInput,
  actorId: string,
  today = toOfficeDate(new Date()),
): Promise<AdjustmentResult> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { employeeId, date, field, value, reason } = parsed.data;

  if (date > today) return { ok: false, error: "That day has not happened yet." };

  const [person] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!person) return { ok: false, error: "That employee no longer exists." };
  if (date < person.joinDate || (person.exitDate !== null && date > person.exitDate)) {
    return { ok: false, error: "That date is outside this person's time at the company." };
  }

  const [before] = await db
    .select()
    .from(attendanceDays)
    .where(and(eq(attendanceDays.employeeId, employeeId), eq(attendanceDays.date, date)));

  let newValue: string | null = null;
  if (value !== null) {
    if (field === "status") {
      newValue = value;
    } else {
      const instant = officeDateTimeToInstant(date, value);
      if (!instant) return { ok: false, error: "Enter a time like 09:30." };
      newValue = instant.toISOString();

      if (field === "last_out" && before?.firstIn && instant <= before.firstIn) {
        return { ok: false, error: "The leaving time must be after the arrival time." };
      }
      if (field === "first_in" && before?.lastOut && instant >= before.lastOut) {
        return { ok: false, error: "The arrival time must be before the leaving time." };
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(attendanceAdjustments).values({ employeeId, date, field, newValue, reason, createdBy: actorId });
    await audit(tx, {
      actorId,
      action: "attendance.adjust",
      entity: "attendance_day",
      entityId: `${employeeId}:${date}`,
      before: before
        ? { status: before.status, firstIn: before.firstIn, lastOut: before.lastOut, isManual: before.isManual }
        : null,
      after: { field, newValue, reason },
    });
  });

  await recalcDay(db, employeeId, date);
  return { ok: true };
}
