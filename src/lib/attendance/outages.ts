import { asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { officeOutages } from "@/db/schema";
import { audit } from "@/lib/audit";
import { finalizedMonthsBetween, lockedMessage } from "@/lib/payroll/lock";
import { isValidOfficeDate, previousDate, timeToMinutes, toOfficeDate } from "@/lib/time";

import { recalcAfterHolidayChange } from "./triggers";

type Db = ReturnType<typeof getDb>;

export const outageSchema = z
  .object({
    date: z.string().refine(isValidOfficeDate, "Enter the date of the outage."),
    startTime: z.string().refine((v) => timeToMinutes(v) !== null, "Enter the time the outage started, like 09:00."),
    endTime: z.string().refine((v) => timeToMinutes(v) !== null, "Enter the time it ended, like 11:30."),
    reason: z.string().trim().min(3, "Say what happened, in a few words.").max(200, "Keep the reason under 200 characters."),
  })
  .refine((o) => (timeToMinutes(o.startTime) ?? 0) < (timeToMinutes(o.endTime) ?? 0), {
    path: ["endTime"],
    message: "The outage must end after it started.",
  });

export type OutageInput = z.input<typeof outageSchema>;

export type OutageRow = { id: string; date: string; startTime: string; endTime: string; reason: string };
export type OutageResult = { ok: true; id: string } | { ok: false; error: string };

const hm = (value: string) => value.slice(0, 5);

/** Outages from a month ago onward, newest first. Older ones stay in the audit log. */
export async function listRecentOutages(db: Pick<Db, "select">, today = toOfficeDate(new Date())): Promise<OutageRow[]> {
  let since = today;
  for (let i = 0; i < 30; i += 1) since = previousDate(since);
  const rows = await db
    .select({ id: officeOutages.id, date: officeOutages.date, startTime: officeOutages.startTime, endTime: officeOutages.endTime, reason: officeOutages.reason })
    .from(officeOutages)
    .where(gte(officeOutages.date, since))
    .orderBy(desc(officeOutages.date), asc(officeOutages.startTime));
  return rows.map((r) => ({ ...r, startTime: hm(r.startTime), endTime: hm(r.endTime) }));
}

/**
 * Records an office outage and recomputes that day for everyone, so late
 * marks the outage caused and absent marks on a day it covered are lifted.
 * One audit row. A date in a month whose payroll is finalized is refused.
 */
export async function createOutage(db: Db, input: OutageInput, actorId: string, today = toOfficeDate(new Date())): Promise<OutageResult> {
  const parsed = outageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const saved = await db.transaction(async (tx): Promise<OutageResult> => {
    const locked = await finalizedMonthsBetween(tx, data.date, data.date, { lock: true });
    if (locked.size > 0) return { ok: false, error: lockedMessage(locked, "attendance for that day") };

    const [row] = await tx.insert(officeOutages).values({ ...data, createdBy: actorId }).returning();
    await audit(tx, { actorId, action: "outage.create", entity: "office_outage", entityId: row.id, after: row });
    return { ok: true, id: row.id };
  });
  if (!saved.ok) return saved;

  await recalcAfterHolidayChange(db, data.date, today);
  return saved;
}

/** Takes an outage back, for one entered by mistake. Recomputes the day. A finalized month is refused. */
export async function removeOutage(db: Db, id: string, actorId: string, today = toOfficeDate(new Date())): Promise<{ ok: true } | { ok: false; error: string }> {
  const [existing] = await db.select().from(officeOutages).where(eq(officeOutages.id, id));
  if (!existing) return { ok: false, error: "That outage was already removed. Reload the page." };

  const result = await db.transaction(async (tx): Promise<{ ok: true } | { ok: false; error: string }> => {
    const locked = await finalizedMonthsBetween(tx, existing.date, existing.date, { lock: true });
    if (locked.size > 0) return { ok: false, error: lockedMessage(locked, "attendance for that day") };

    const [row] = await tx.delete(officeOutages).where(eq(officeOutages.id, id)).returning();
    if (row) await audit(tx, { actorId, action: "outage.delete", entity: "office_outage", entityId: id, before: row });
    return { ok: true };
  });
  if (!result.ok) return result;

  await recalcAfterHolidayChange(db, existing.date, today);
  return { ok: true };
}
