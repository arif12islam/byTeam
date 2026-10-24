import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { holidays } from "@/db/schema";
import { audit } from "@/lib/audit";
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

  return db.transaction(async (tx) => {
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
}

/** Returns false when the holiday was already gone. */
export async function removeHoliday(db: Db, id: string, actorId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(holidays).where(eq(holidays.id, id)).returning();
    if (!row) return false;
    await audit(tx, {
      actorId,
      action: "holiday.delete",
      entity: "holiday",
      entityId: row.id,
      before: row,
    });
    return true;
  });
}
