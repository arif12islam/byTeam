import { describe, expect, it } from "vitest";

import type { TodayBoard } from "@/lib/attendance/today";
import type { DeviceRow } from "@/lib/devices/devices";
import { isPushEndpoint } from "@/lib/notifications/endpoints";
import { deviceAlerts, morningSummary, officeWindow, unmatchedAlerts, withinWindow } from "@/lib/notifications/rules";
import type { UnmatchedCode } from "@/lib/punches/unmatched";
import { officeDateTimeToInstant } from "@/lib/time";

/** A Dhaka clock time on 2026-11-10 (a Tuesday), as an instant. */
const at = (time: string, date = "2026-11-10") => officeDateTimeToInstant(date, time)!;
const none = new Map<string, string>();

const device = (over: Partial<DeviceRow> = {}): DeviceRow =>
  ({ id: "d1", serialNo: "SN100", name: "Front door", lastSeenAt: at("11:00"), clockOffsetSeconds: null, clockCheckedAt: null, active: true, ...over }) as DeviceRow;

describe("office hours for alerts", () => {
  it("run from the earliest shift start to the latest shift end", () => {
    const window = officeWindow([
      { startTime: "09:00:00", endTime: "18:00:00" },
      { startTime: "08:30:00", endTime: "17:00:00" },
    ]);
    expect(window).toEqual({ from: 8 * 60 + 30, to: 18 * 60 });
    expect(withinWindow(at("08:29"), window)).toBe(false);
    expect(withinWindow(at("08:30"), window)).toBe(true);
    expect(withinWindow(at("18:00"), window)).toBe(true);
    expect(withinWindow(at("18:01"), window)).toBe(false);
  });

  it("do not exist without shifts, so nothing is sent", () => {
    expect(officeWindow([])).toBeNull();
    expect(withinWindow(at("12:00"), null)).toBe(false);
  });
});

describe("deviceAlerts", () => {
  it("says nothing about a device heard from recently", () => {
    expect(deviceAlerts([device({ lastSeenAt: at("11:50") })], at("12:00"), none)).toEqual({ alerts: [], recovered: [] });
  });

  it("alerts once when a device goes quiet, with how long, and not again", () => {
    const quiet = device({ lastSeenAt: at("10:00") });
    const first = deviceAlerts([quiet], at("12:00"), none);
    expect(first.alerts).toHaveLength(1);
    expect(first.alerts[0]).toMatchObject({ kind: "offline", stateKey: "offline:SN100", url: "/devices", title: "Fingerprint device offline" });
    expect(first.alerts[0].body).toContain("Front door");
    expect(first.alerts[0].body).toContain("2 h ago");

    const later = deviceAlerts([quiet], at("13:00"), new Map([["offline:SN100", "sent"]]));
    expect(later).toEqual({ alerts: [], recovered: [] });
  });

  it("says when it is back, once", () => {
    const back = deviceAlerts([device({ lastSeenAt: at("12:00") })], at("12:05"), new Map([["offline:SN100", "sent"]]));
    expect(back.alerts).toEqual([]);
    expect(back.recovered).toHaveLength(1);
    expect(back.recovered[0]).toMatchObject({ stateKey: "offline:SN100", alert: { title: "Fingerprint device is back" } });
    expect(deviceAlerts([device({ lastSeenAt: at("12:00") })], at("12:05"), none).recovered).toEqual([]);
  });

  it("ignores switched off devices and ones that never connected", () => {
    const quiet = at("08:00");
    expect(deviceAlerts([device({ active: false, lastSeenAt: quiet })], at("12:00"), none).alerts).toEqual([]);
    expect(deviceAlerts([device({ lastSeenAt: null })], at("12:00"), none).alerts).toEqual([]);
  });
});

describe("morningSummary", () => {
  const board = (over: Partial<TodayBoard> = {}): TodayBoard => ({
    offDay: null,
    counts: { in: 18, late: 2, onLeave: 1, notInYet: 3, absent: 0 },
    entries: [],
    ...over,
  });

  it("is sent at the first check from 10:00 on a working day, in plain words", () => {
    const note = morningSummary(board(), at("10:05"), none);
    expect(note).toMatchObject({ kind: "summary", stateKey: "summary:2026-11-10", url: "/today", title: "Today at the office" });
    expect(note?.body).toBe("18 in (2 late), 3 not in yet, 1 on leave.");
  });

  it("waits until 10:00, and is sent once a day", () => {
    expect(morningSummary(board(), at("09:55"), none)).toBeNull();
    expect(morningSummary(board(), at("11:05"), new Map([["summary:2026-11-10", "sent"]]))).toBeNull();
    expect(morningSummary(board(), at("10:05", "2026-11-11"), new Map([["summary:2026-11-10", "sent"]]))).not.toBeNull();
  });

  it("is skipped on a day off and when nobody is expected", () => {
    expect(morningSummary(board({ offDay: "holiday" }), at("10:05"), none)).toBeNull();
    expect(morningSummary(board({ offDay: "weekly_off" }), at("10:05"), none)).toBeNull();
    expect(morningSummary(board({ counts: { in: 0, late: 0, onLeave: 0, notInYet: 0, absent: 0 } }), at("10:05"), none)).toBeNull();
  });

  it("leaves out the parts that are zero", () => {
    const note = morningSummary(board({ counts: { in: 5, late: 0, onLeave: 0, notInYet: 0, absent: 1 } }), at("10:05"), none);
    expect(note?.body).toBe("5 in, 1 absent.");
  });
});

describe("unmatchedAlerts", () => {
  const code = (over: Partial<UnmatchedCode> = {}): UnmatchedCode => ({
    empCode: "23",
    punches: 5,
    firstPunchAt: at("08:50"),
    lastPunchAt: at("09:10"),
    devices: ["SN100"],
    ...over,
  });

  it("alerts for a code that punched today, with a link that starts adding that person", () => {
    const [alert] = unmatchedAlerts([code()], at("10:00"), none);
    expect(alert).toMatchObject({ kind: "unmatched", stateKey: "unmatched:23", stateValue: "2026-11-10", url: "/employees/new?code=23" });
    expect(alert.body).toContain("Code 23");
    expect(alert.body).toContain("5 punches");
  });

  it("is told once a day for each code, and not for a code that last punched on another day", () => {
    expect(unmatchedAlerts([code()], at("10:00"), new Map([["unmatched:23", "2026-11-10"]]))).toEqual([]);
    expect(unmatchedAlerts([code()], at("10:00"), new Map([["unmatched:23", "2026-11-09"]]))).toHaveLength(1);
    expect(unmatchedAlerts([code({ lastPunchAt: at("17:00", "2026-11-09") })], at("10:00"), none)).toEqual([]);
  });

  it("says one punch in the singular", () => {
    expect(unmatchedAlerts([code({ punches: 1 })], at("10:00"), none)[0].body).toContain("1 punch in all");
  });
});

describe("isPushEndpoint", () => {
  it("accepts the addresses browsers get from their push services", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc")).toBe(true);
  });

  it("refuses anything else, so the server cannot be pointed at other addresses", () => {
    expect(isPushEndpoint("https://example.com/push")).toBe(false);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.com/abc")).toBe(false);
    expect(isPushEndpoint("https://user:pw@fcm.googleapis.com/abc")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/abc")).toBe(false);
    expect(isPushEndpoint("https://notapple.com/x.push.apple.com")).toBe(false);
    expect(isPushEndpoint("not a url")).toBe(false);
    expect(isPushEndpoint("")).toBe(false);
  });
});
