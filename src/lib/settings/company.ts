import { eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { companySettings } from "@/db/schema";
import { audit } from "@/lib/audit";
import { recalcAfterWeeklyOffChange } from "@/lib/attendance/triggers";

type Db = ReturnType<typeof getDb>;

/** Sunday is 0, matching weekdayOf in src/lib/time.ts. Shown Saturday first because the office week starts there. */
export const WEEKDAYS = [
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
] as const;

export const companySettingsSchema = z.object({
  name: z.string().trim().min(1, "Enter the company name.").max(120, "Use 120 characters or fewer."),
  weeklyOffDays: z
    .array(z.coerce.number().int().min(0).max(6))
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
});

export type CompanySettingsInput = z.input<typeof companySettingsSchema>;

export type CompanySettings = {
  name: string;
  weeklyOffDays: number[];
  timezone: string;
  currency: string;
};

/** The one settings row, or the defaults before anyone has saved. */
export async function getCompanySettings(db: Pick<Db, "select">): Promise<CompanySettings> {
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1));
  return {
    name: row?.name ?? "",
    weeklyOffDays: row?.weeklyOffDays ?? [],
    timezone: row?.timezone ?? "Asia/Dhaka",
    currency: row?.currency ?? "BDT",
  };
}

export function sameSettings(
  a: Pick<CompanySettings, "name" | "weeklyOffDays">,
  b: Pick<CompanySettings, "name" | "weeklyOffDays">,
): boolean {
  return a.name === b.name && a.weeklyOffDays.join(",") === b.weeklyOffDays.join(",");
}

/**
 * Saves company name and weekly off days with an audit row. Saving the same
 * values again writes nothing. Returns whether anything changed.
 */
export async function saveCompanySettings(
  db: Db,
  input: CompanySettingsInput,
  actorId: string,
): Promise<{ changed: boolean }> {
  const data = companySettingsSchema.parse(input);

  const outcome = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(companySettings).where(eq(companySettings.id, 1));
    if (before && sameSettings(before, data)) return { changed: false, offDaysChanged: false };

    const [after] = await tx
      .insert(companySettings)
      .values({ id: 1, name: data.name, weeklyOffDays: data.weeklyOffDays })
      .onConflictDoUpdate({
        target: companySettings.id,
        set: { name: data.name, weeklyOffDays: data.weeklyOffDays, updatedAt: new Date() },
      })
      .returning();

    await audit(tx, {
      actorId,
      action: before ? "settings.update" : "settings.create",
      entity: "company_settings",
      entityId: "1",
      before,
      after,
    });
    return { changed: true, offDaysChanged: before?.weeklyOffDays.join(",") !== data.weeklyOffDays.join(",") };
  });

  // Weekly off days apply from today. Earlier days keep how they were computed.
  if (outcome.offDaysChanged) await recalcAfterWeeklyOffChange(db);
  return { changed: outcome.changed };
}
