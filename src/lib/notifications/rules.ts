import { describeAge, deviceStatus, type DeviceRow } from "@/lib/devices/devices";
import type { TodayBoard } from "@/lib/attendance/today";
import type { UnmatchedCode } from "@/lib/punches/unmatched";
import { officeMinuteOfDay, timeToMinutes, toOfficeDate } from "@/lib/time";

/**
 * What to tell people and when, as pure functions over data that is already
 * loaded. Nothing here reads the database or the clock; src/lib/notifications/run.ts
 * does the loading and sending. Each alert has a key: the same key is never
 * announced twice, and recovery clears it.
 */

export type Alert = {
  /** Which choice on a device turns this alert on or off. */
  kind: "offline" | "summary" | "unmatched";
  /** Remembered once sent, so it is not sent again. */
  stateKey: string;
  /** What to remember about it. */
  stateValue: string;
  title: string;
  body: string;
  /** Where tapping the notification goes. */
  url: string;
  /** Alerts with the same tag replace each other on the phone. */
  tag: string;
};

/** A first summary is sent at the first check at or after this hour (office time) on a working day. */
export const SUMMARY_HOUR = 10;

/** Office hours for alerts: from the earliest shift start to the latest shift end. Null when there are no shifts. */
export function officeWindow(shifts: readonly { startTime: string; endTime: string }[]): { from: number; to: number } | null {
  const starts = shifts.map((s) => timeToMinutes(s.startTime)).filter((m): m is number => m !== null);
  const ends = shifts.map((s) => timeToMinutes(s.endTime)).filter((m): m is number => m !== null);
  if (starts.length === 0 || ends.length === 0) return null;
  return { from: Math.min(...starts), to: Math.max(...ends) };
}

/** True when the office clock is inside the window. */
export function withinWindow(now: Date, window: { from: number; to: number } | null): boolean {
  if (window === null) return false;
  const minute = officeMinuteOfDay(now);
  return minute >= window.from && minute <= window.to;
}

export type DeviceAlerts = { alerts: Alert[]; /** Keys to forget: the device is back. */ recovered: { stateKey: string; alert: Alert }[] };

/**
 * A device that has gone quiet gets one alert, until it is heard from again,
 * which gets one "back" notice. Switched-off devices and ones that never
 * connected are not worth an alert. `notified` is what was announced before:
 * state key to value.
 */
export function deviceAlerts(devices: readonly DeviceRow[], now: Date, notified: ReadonlyMap<string, string>): DeviceAlerts {
  const alerts: Alert[] = [];
  const recovered: DeviceAlerts["recovered"] = [];

  for (const device of devices) {
    if (!device.active) continue;
    const stateKey = `offline:${device.serialNo}`;
    const status = deviceStatus(device.lastSeenAt, now);

    if (status === "offline" && !notified.has(stateKey)) {
      const age = describeAge(device.lastSeenAt, now);
      alerts.push({
        kind: "offline",
        stateKey,
        stateValue: now.toISOString(),
        title: "Fingerprint device offline",
        body: `${device.name} was last heard from ${age ?? "a while ago"}. Check its power and the office laptop.`,
        url: "/devices",
        tag: stateKey,
      });
    }
    if (status === "online" && notified.has(stateKey)) {
      recovered.push({
        stateKey,
        alert: {
          kind: "offline",
          stateKey,
          stateValue: "",
          title: "Fingerprint device is back",
          body: `${device.name} is sending punches again.`,
          url: "/devices",
          tag: stateKey,
        },
      });
    }
  }
  return { alerts, recovered };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The morning summary of Today: once on each working day, at the first check
 * from SUMMARY_HOUR. Null on a day off, before the time, or when it was sent.
 */
export function morningSummary(board: TodayBoard, now: Date, notified: ReadonlyMap<string, string>, summaryHour = SUMMARY_HOUR): Alert | null {
  const today = toOfficeDate(now);
  const stateKey = `summary:${today}`;
  if (board.offDay !== null || notified.has(stateKey)) return null;
  if (officeMinuteOfDay(now) < summaryHour * 60) return null;

  const { counts } = board;
  const expected = counts.in + counts.notInYet + counts.absent + counts.onLeave;
  if (expected === 0) return null;

  const parts = [`${counts.in} in${counts.late > 0 ? ` (${counts.late} late)` : ""}`];
  if (counts.notInYet > 0) parts.push(`${counts.notInYet} not in yet`);
  if (counts.absent > 0) parts.push(`${counts.absent} absent`);
  if (counts.onLeave > 0) parts.push(`${counts.onLeave} on leave`);
  return {
    kind: "summary",
    stateKey,
    stateValue: now.toISOString(),
    title: "Today at the office",
    body: `${parts.join(", ")}.`,
    url: "/today",
    tag: stateKey,
  };
}

/** A code that punched today but belongs to nobody, announced once a day for each code. */
export function unmatchedAlerts(codes: readonly UnmatchedCode[], now: Date, notified: ReadonlyMap<string, string>): Alert[] {
  const today = toOfficeDate(now);
  const alerts: Alert[] = [];
  for (const code of codes) {
    if (toOfficeDate(code.lastPunchAt) !== today) continue;
    const stateKey = `unmatched:${code.empCode}`;
    if (notified.get(stateKey) === today) continue;
    alerts.push({
      kind: "unmatched",
      stateKey,
      stateValue: today,
      title: "Unknown code punched",
      body: `Code ${code.empCode} punched (${plural(code.punches, "punch", "punches")} in all) but is not linked to anyone. Add them or check the device.`,
      url: `/employees/new?code=${encodeURIComponent(code.empCode)}`,
      tag: stateKey,
    });
  }
  return alerts;
}
