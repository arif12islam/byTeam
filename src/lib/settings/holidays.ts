import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { holidays } from "@/db/schema";
import { audit } from "@/lib/audit";
import { recalcAfterHolidayChange } from "@/lib/attendance/triggers";
import { isValidOfficeDate } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

export const holidaySchema = z.object({
  date: z.string().refine(isValidOfficeDate, "Enter a valid date."),
  name: z.string().trim().min(1, "Enter the holiday name.").max(120, "Use 120 characters or fewer."),
});

export type HolidayInput = z.input<typeof holidaySchema>;

export type Holiday = { id: string; date: string; name: string };

/** Holidays grouped by calendar year, years and dates ascending. */
export function groupByYear(list: Holiday[]): { year: string; holidays: Holiday[] }[] {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const groups: { year: string; holidays: Holiday[] }[] = [];
  for (const holiday of sorted) {
    const year = holiday.date.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last?.year === year) last.holidays.push(holiday);
    else groups.push({ year, holidays: [holiday] });
  }
  return groups;
}

export async function listHolidays(db: Db): Promise<Holiday[]> {
  return db
    .select({ id: holidays.id, date: holidays.date, name: holidays.name })
    .from(holidays)
    .orderBy(asc(holidays.date));
}

/** Throws a unique violation when a holiday already exists on that date. */
export async function addHoliday(db: Db, input: HolidayInput, actorId: string): Promise<Holiday> {
  const data = holidaySchema.parse(input);

  const holiday = await db.transaction(async (tx) => {
    const [row] = await tx.insert(holidays).values(data).returning();
    await audit(tx, {
      actorId,
      action: "holiday.create",
      entity: "holiday",
      entityId: row.id,
      after: row,
    });
    return { id: row.id, date: row.date, name: row.name };
  });
  await recalcAfterHolidayChange(db, holiday.date);
  return holiday;
}

/** Returns false when the holiday was already gone. */
export async function removeHoliday(db: Db, id: string, actorId: string): Promise<boolean> {
  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(holidays).where(eq(holidays.id, id)).returning();
    if (!row) return null;
    await audit(tx, {
      actorId,
      action: "holiday.delete",
      entity: "holiday",
      entityId: row.id,
      before: row,
    });
    return row.date;
  });
  if (removed === null) return false;
  await recalcAfterHolidayChange(db, removed);
  return true;
}

/**
 * Changes a holiday's date or name. Throws a unique violation when another
 * holiday is already on the new date. Returns null when it is gone. The old and
 * the new date are both recomputed, since each changes from a holiday to a
 * working day or back.
 */
export async function updateHoliday(db: Db, id: string, input: HolidayInput, actorId: string): Promise<{ changed: boolean } | null> {
  const data = holidaySchema.parse(input);

  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(holidays).where(eq(holidays.id, id));
    if (!before) return null;
    if (before.date === data.date && before.name === data.name) return { changed: false, oldDate: before.date };

    const [after] = await tx.update(holidays).set(data).where(eq(holidays.id, id)).returning();
    await audit(tx, { actorId, action: "holiday.update", entity: "holiday", entityId: id, before, after });
    return { changed: true, oldDate: before.date };
  });
  if (!result) return null;

  if (result.changed) {
    await recalcAfterHolidayChange(db, result.oldDate);
    if (result.oldDate !== data.date) await recalcAfterHolidayChange(db, data.date);
  }
  return { changed: result.changed };
}
