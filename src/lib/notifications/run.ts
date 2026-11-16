import { count } from "drizzle-orm";

import type { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { loadTodayBoard } from "@/lib/attendance/today";
import { listDevices } from "@/lib/devices/devices";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { listShifts } from "@/lib/shifts/shifts";
import { nextDate, officeDateTimeToInstant, officeMinuteOfDay, toOfficeDate } from "@/lib/time";

import { getOrCreateVapidKeys } from "./keys";
import { BRIEF_HOUR, dailyBrief, deviceAlerts, morningSummary, officeWindow, SUMMARY_HOUR, unmatchedAlerts, withinWindow, type Alert } from "./rules";
import { realWebPush, sendAlert, vapidSubject, type WebPushLike } from "./sender";
import { forgetState, pruneState, readState, writeState } from "./state";

type Db = ReturnType<typeof getDb>;

export type RunSummary = {
  /** Why nothing was checked, when that is so. */
  skipped?: string;
  offline: number;
  recovered: number;
  summary: boolean;
  unmatched: number;
  delivered: number;
};

const NOTHING: RunSummary = { offline: 0, recovered: 0, summary: false, unmatched: 0, delivered: 0 };

/**
 * One round of checks, run from the scheduler: is a device quiet, is it time
 * for the morning summary, did an unknown code punch. Sends what is new to the
 * devices that want it and remembers it, so nothing is announced twice.
 *
 * It does nothing, and asks the database for almost nothing, when nobody has
 * turned notifications on or the office is closed, so the database can sleep.
 */
export async function runNotificationChecks(db: Db, now: Date, webPush: WebPushLike = realWebPush): Promise<RunSummary> {
  const [{ devicesOn }] = await db.select({ devicesOn: count() }).from(pushSubscriptions);
  if (devicesOn === 0) return { ...NOTHING, skipped: "no device has notifications on" };

  const shifts = await listShifts(db);
  // The evening brief is sent after office hours; everything else only during them.
  const inOffice = withinWindow(now, officeWindow(shifts));
  const evening = officeMinuteOfDay(now) >= BRIEF_HOUR * 60;
  if (!inOffice && !evening) return { ...NOTHING, skipped: "outside office hours" };

  const keys = await getOrCreateVapidKeys(db);
  const deps = { webPush, keys, subject: vapidSubject() };
  const notified = await readState(db);
  const summary: RunSummary = { ...NOTHING };

  /** Sends, then remembers it, unless every device failed (then the next round tries again). */
  const announce = async (alert: Alert) => {
    const result = await sendAlert(db, alert, deps);
    summary.delivered += result.delivered;
    if (result.recipients === 0 || result.delivered > 0 || result.removed === result.recipients) await writeState(db, alert.stateKey, alert.stateValue);
  };

  if (inOffice) {
    const devices = await listDevices(db);
    const found = deviceAlerts(devices, now, notified);
    for (const alert of found.alerts) await announce(alert);
    summary.offline = found.alerts.length;
    for (const { stateKey, alert } of found.recovered) {
      await sendAlert(db, alert, deps);
      await forgetState(db, stateKey);
    }
    summary.recovered = found.recovered.length;
  }

  // The summaries need the whole board, so only work it out when one is due.
  const summaryDue = (inOffice && officeMinuteOfDay(now) >= SUMMARY_HOUR * 60 && officeMinuteOfDay(now) < BRIEF_HOUR * 60) || evening;
  if (summaryDue) {
    const board = await loadTodayBoard(db, now);
    const note = evening ? dailyBrief(board, now, notified) : morningSummary(board, now, notified);
    if (note) {
      await announce(note);
      summary.summary = true;
    }
  }

  if (!inOffice) {
    await pruneState(db, now);
    return summary;
  }

  // Only codes that punched today matter, and punches dated in the future must not fill the list first.
  const today = toOfficeDate(now);
  const codes = await listUnmatchedCodes(db, {
    lastPunchFrom: officeDateTimeToInstant(today, "00:00") ?? undefined,
    lastPunchBefore: officeDateTimeToInstant(nextDate(today), "00:00") ?? undefined,
  });
  const unmatched = unmatchedAlerts(codes, now, notified);
  for (const alert of unmatched) await announce(alert);
  summary.unmatched = unmatched.length;

  await pruneState(db, now);
  return summary;
}
