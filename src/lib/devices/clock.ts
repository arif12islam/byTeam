import { eq } from "drizzle-orm";

import type { getDb } from "@/db";
import { devices } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

/** More than this many minutes between the device clock and ours flags the device. */
export const CLOCK_DRIFT_LIMIT_MINUTES = 5;

/** An upload of this many punches or fewer is treated as live: the punch just happened. */
export const LIVE_BATCH_MAX = 3;

/**
 * How far the device clock is from ours, in seconds (positive means the device
 * is ahead), judged from the punch times in one upload and the moment it arrived.
 *
 * The device only tells us when each punch happened, so the newest punch is
 * compared with the receive time. A punch dated in the future proves the device
 * is ahead, whatever the size of the upload. A punch dated in the past proves
 * little: a device sends a backlog after an outage, and then the newest punch is
 * old even with a perfect clock. So a lag is only used for a live-sized upload.
 * Returns null when there is nothing to judge by.
 */
export function estimateClockOffset(punchTimes: readonly Date[], receivedAt: Date): number | null {
  if (punchTimes.length === 0) return null;
  const newest = Math.max(...punchTimes.map((t) => t.getTime()));
  const offset = Math.round((newest - receivedAt.getTime()) / 1000);
  if (offset > 0) return offset;
  return punchTimes.length <= LIVE_BATCH_MAX ? offset : null;
}

export type ClockState =
  | { kind: "unchecked" }
  | { kind: "ok"; seconds: number }
  | { kind: "drifted"; direction: "ahead" | "behind"; minutes: number };

/** Turns the stored estimate into a state: flagged when the gap is over the limit. */
export function clockState(offsetSeconds: number | null): ClockState {
  if (offsetSeconds === null) return { kind: "unchecked" };
  if (Math.abs(offsetSeconds) <= CLOCK_DRIFT_LIMIT_MINUTES * 60) return { kind: "ok", seconds: offsetSeconds };
  return { kind: "drifted", direction: offsetSeconds > 0 ? "ahead" : "behind", minutes: Math.round(Math.abs(offsetSeconds) / 60) };
}

/** Plain words for the Devices screen. */
export function describeClock(state: ClockState): string {
  switch (state.kind) {
    case "unchecked":
      return "Clock not checked yet. It is checked from the time on each punch the device sends.";
    case "ok":
      return "Clock looks right.";
    case "drifted": {
      const unit = state.minutes === 1 ? "minute" : "minutes";
      const wholeHours = state.minutes % 60 === 0;
      return (
        `Clock is about ${state.minutes} ${unit} ${state.direction === "ahead" ? "ahead of" : "behind"} the server. Punch times, late marks and absences will be wrong until you set the time on the device.` +
        (wholeHours ? " A gap of whole hours usually means the device time zone is wrong." : "")
      );
    }
  }
}

/**
 * Saves the clock estimate for a device from one upload. Never throws: it is a
 * health check, and a failure must not make the device resend its punches.
 */
export async function recordClockCheck(db: Db, serialNo: string, punchTimes: readonly Date[], receivedAt: Date): Promise<void> {
  try {
    const offset = estimateClockOffset(punchTimes, receivedAt);
    if (offset === null) return;
    await db.update(devices).set({ clockOffsetSeconds: offset, clockCheckedAt: receivedAt }).where(eq(devices.serialNo, serialNo));
  } catch (error) {
    console.error(`[iclock] ${serialNo}: clock check not saved`, error);
  }
}

/**
 * Requests from byTeam's office agent (see agent/), which reads devices that
 * cannot push. The agent forwards punches some time after they happened, so
 * the age of a punch says nothing about the device clock. Instead the agent
 * reads the device clock itself, sets it right, and reports what it measured.
 */
export function isOfficeAgent(request: Request): boolean {
  return /^byTeam-agent\//.test(request.headers.get("user-agent") ?? "");
}

/** The clock offset in whole seconds the agent reported, or null when there is none or it makes no sense. */
export function parseReportedOffset(value: string | null): number | null {
  if (value === null || !/^-?\d{1,9}$/.test(value)) return null;
  const seconds = Number(value);
  return Math.abs(seconds) <= 366 * 86400 ? seconds : null;
}

/** Saves a clock offset the agent measured on the device. Never throws, like recordClockCheck. */
export async function recordMeasuredClock(db: Db, serialNo: string, offsetSeconds: number, at: Date): Promise<void> {
  try {
    await db.update(devices).set({ clockOffsetSeconds: offsetSeconds, clockCheckedAt: at }).where(eq(devices.serialNo, serialNo));
  } catch (error) {
    console.error(`[iclock] ${serialNo}: clock check not saved`, error);
  }
}
