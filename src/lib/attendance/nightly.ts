import type { getDb } from "@/db";
import { previousDate, toOfficeDate } from "@/lib/time";

import { recalc, type RecalcSummary } from "./recalc";

type Db = ReturnType<typeof getDb>;

export type NightlyResult = RecalcSummary & { date: string };

/**
 * The nightly job: rebuilds the previous office day for every active employee.
 * Day-by-day recalculation already happens when punches and settings change, so
 * this is the safety net that closes out yesterday and fixes anything a failed
 * trigger missed.
 */
export async function runNightlyRecalc(db: Db, now: Date = new Date()): Promise<NightlyResult> {
  const date = previousDate(toOfficeDate(now));
  const summary = await recalc(db, { employeeIds: null, from: date, to: date });
  return { date, ...summary };
}
