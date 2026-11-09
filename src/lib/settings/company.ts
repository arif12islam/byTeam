import { eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { companySettings } from "@/db/schema";
import { audit } from "@/lib/audit";
import { recalcAfterLeavingPunchChange, recalcAfterWeeklyOffChange } from "@/lib/attendance/triggers";

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
  /** Left out means keep the saved choice. */
  trackLeavingPunch: z.boolean().optional(),
});

export type CompanySettingsInput = z.input<typeof companySettingsSchema>;

export type CompanySettings = {
  name: string;
  weeklyOffDays: number[];
  timezone: string;
  currency: string;
  /** Whether the office uses the leaving punch. */
  trackLeavingPunch: boolean;
};

/** The one settings row, or the defaults before anyone has saved. */
export async function getCompanySettings(db: Pick<Db, "select">): Promise<CompanySettings> {
  const [row] = await db.select().from(companySettings).where(eq(companySettings.id, 1));
  return {
    name: row?.name ?? "",
    weeklyOffDays: row?.weeklyOffDays ?? [],
    timezone: row?.timezone ?? "Asia/Dhaka",
    currency: row?.currency ?? "BDT",
    trackLeavingPunch: row?.trackLeavingPunch ?? true,
  };
}

export function sameSettings(
  a: Pick<CompanySettings, "name" | "weeklyOffDays" | "trackLeavingPunch">,
  b: Pick<CompanySettings, "name" | "weeklyOffDays" | "trackLeavingPunch">,
): boolean {
  return a.name === b.name && a.weeklyOffDays.join(",") === b.weeklyOffDays.join(",") && a.trackLeavingPunch === b.trackLeavingPunch;
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
    const trackLeavingPunch = data.trackLeavingPunch ?? before?.trackLeavingPunch ?? true;
    const next = { name: data.name, weeklyOffDays: data.weeklyOffDays, trackLeavingPunch };
    if (before && sameSettings(before, next)) return { changed: false, offDaysChanged: false, leavingPunchChanged: false };

    const [after] = await tx
      .insert(companySettings)
      .values({ id: 1, ...next })
      .onConflictDoUpdate({
        target: companySettings.id,
        set: { ...next, updatedAt: new Date() },
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
    return {
      changed: true,
      offDaysChanged: before?.weeklyOffDays.join(",") !== data.weeklyOffDays.join(","),
      leavingPunchChanged: before !== undefined && before.trackLeavingPunch !== trackLeavingPunch,
    };
  });

  // Both apply from today. Earlier days keep how they were computed.
  if (outcome.offDaysChanged) await recalcAfterWeeklyOffChange(db);
  else if (outcome.leavingPunchChanged) await recalcAfterLeavingPunchChange(db);
  return { changed: outcome.changed };
}
