import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { employees, shifts } from "@/db/schema";
import { audit } from "@/lib/audit";

type Db = ReturnType<typeof getDb>;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** Minutes after midnight for "HH:MM" or "HH:MM:SS", or null when it is not a time of day. */
export function timeToMinutes(value: string): number | null {
  const match = TIME.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "09:00:00" from the database becomes "09:00" for forms and screens. */
export function toHm(value: string): string {
  return value.slice(0, 5);
}

/** "9 h" or "8 h 30 min" for the length of a shift. */
export function formatShiftLength(start: string, end: string): string {
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  if (from === null || to === null || to <= from) return "";
  const minutes = to - from;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const shiftSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a shift name.").max(60, "Use 60 characters or fewer."),
    startTime: z.string().refine((v) => timeToMinutes(v) !== null, "Enter a start time."),
    endTime: z.string().refine((v) => timeToMinutes(v) !== null, "Enter an end time."),
    // A text field: an empty one is an error, not zero.
    graceMinutes: z.preprocess(
      (v) => (typeof v === "number" ? String(v) : v),
      z
        .string()
        .trim()
        .regex(/^\d+$/, "Enter the grace minutes as a whole number, like 10.")
        .transform(Number)
        .pipe(z.number().max(180, "Grace minutes cannot be more than 180.")),
    ),
  })
  .refine((s) => timeToMinutes(s.endTime)! > timeToMinutes(s.startTime)!, {
    path: ["endTime"],
    message: "The shift must end after it starts. Night shifts are not supported yet.",
  })
  .transform((s) => ({ ...s, startTime: toHm(s.startTime), endTime: toHm(s.endTime) }));

export type ShiftInput = z.input<typeof shiftSchema>;

export type ShiftRow = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  employeeCount: number;
};

/** All shifts by start time, with how many employees are assigned to each. */
export async function listShifts(db: Db): Promise<ShiftRow[]> {
  const rows = await db
    .select({
      id: shifts.id,
      name: shifts.name,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      graceMinutes: shifts.graceMinutes,
      employeeCount: count(employees.id),
    })
    .from(shifts)
    .leftJoin(employees, eq(employees.shiftId, shifts.id))
    .groupBy(shifts.id)
    .orderBy(asc(shifts.startTime), asc(shifts.name));

  return rows.map((r) => ({ ...r, startTime: toHm(r.startTime), endTime: toHm(r.endTime) }));
}

/** Throws a unique violation when another shift has the same name. */
export async function createShift(db: Db, input: ShiftInput, actorId: string) {
  const data = shiftSchema.parse(input);

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(shifts).values(data).returning();
    await audit(tx, { actorId, action: "shift.create", entity: "shift", entityId: row.id, after: row });
    return row;
  });
}

/** Returns null when the shift no longer exists. Saving unchanged values writes nothing. */
export async function updateShift(db: Db, id: string, input: ShiftInput, actorId: string) {
  const data = shiftSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(shifts).where(eq(shifts.id, id));
    if (!before) return null;

    const unchanged =
      before.name === data.name &&
      toHm(before.startTime) === data.startTime &&
      toHm(before.endTime) === data.endTime &&
      before.graceMinutes === data.graceMinutes;
    if (unchanged) return { shift: before, changed: false };

    const [after] = await tx.update(shifts).set(data).where(eq(shifts.id, id)).returning();
    await audit(tx, { actorId, action: "shift.update", entity: "shift", entityId: id, before, after });
    return { shift: after, changed: true };
  });
}
