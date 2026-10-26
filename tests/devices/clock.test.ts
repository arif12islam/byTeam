import { describe, expect, it } from "vitest";

import { CLOCK_DRIFT_LIMIT_MINUTES, clockState, describeClock, estimateClockOffset, isOfficeAgent, LIVE_BATCH_MAX, parseReportedOffset } from "@/lib/devices/clock";

const received = new Date("2026-10-26T04:00:00Z");
const minutes = (n: number) => new Date(received.getTime() + n * 60_000);
const seconds = (n: number) => new Date(received.getTime() + n * 1000);

describe("estimateClockOffset", () => {
  it("is the newest punch minus the receive time, in seconds, positive when the device is ahead", () => {
    expect(estimateClockOffset([seconds(-20)], received)).toBe(-20);
    expect(estimateClockOffset([seconds(45)], received)).toBe(45);
    expect(estimateClockOffset([minutes(12)], received)).toBe(720);
    expect(estimateClockOffset([seconds(0)], received)).toBe(0);
  });

  it("uses the newest punch of an upload, not the first", () => {
    expect(estimateClockOffset([minutes(-300), seconds(-10), minutes(-60)], received)).toBe(-10);
  });

  it("has nothing to judge by with no punches", () => {
    expect(estimateClockOffset([], received)).toBeNull();
  });

  it("trusts a punch in the future whatever the size of the upload", () => {
    const backlog = Array.from({ length: 200 }, (_, i) => minutes(-1000 + i));
    expect(estimateClockOffset([...backlog, minutes(9)], received)).toBe(540);
  });

  it("trusts a lag only for a live-sized upload, because a backlog is old on purpose", () => {
    const live = Array.from({ length: LIVE_BATCH_MAX }, (_, i) => minutes(-8 - i));
    expect(estimateClockOffset(live, received)).toBe(-8 * 60);
    const backlog = Array.from({ length: LIVE_BATCH_MAX + 1 }, (_, i) => minutes(-8 - i));
    expect(estimateClockOffset(backlog, received)).toBeNull();
    // A backlog whose newest punch is only seconds old tells nothing about being behind either.
    expect(estimateClockOffset([...backlog, seconds(-5)], received)).toBeNull();
  });

  it("rounds to whole seconds", () => {
    expect(estimateClockOffset([new Date(received.getTime() + 1499)], received)).toBe(1);
    expect(estimateClockOffset([new Date(received.getTime() - 1600)], received)).toBe(-2);
  });
});

describe("clockState", () => {
  it("is unchecked until there is an estimate", () => {
    expect(clockState(null)).toEqual({ kind: "unchecked" });
  });

  it("is fine up to and including the limit, either way", () => {
    const limit = CLOCK_DRIFT_LIMIT_MINUTES * 60;
    expect(clockState(0)).toEqual({ kind: "ok", seconds: 0 });
    expect(clockState(limit)).toEqual({ kind: "ok", seconds: limit });
    expect(clockState(-limit)).toEqual({ kind: "ok", seconds: -limit });
  });

  it("is flagged just over the limit, with the direction and whole minutes", () => {
    expect(clockState(5 * 60 + 1)).toEqual({ kind: "drifted", direction: "ahead", minutes: 5 });
    expect(clockState(-(5 * 60 + 1))).toEqual({ kind: "drifted", direction: "behind", minutes: 5 });
    expect(clockState(-2 * 3600)).toEqual({ kind: "drifted", direction: "behind", minutes: 120 });
  });

  it("uses a limit of 5 minutes", () => {
    expect(CLOCK_DRIFT_LIMIT_MINUTES).toBe(5);
  });
});

describe("describeClock", () => {
  it("says what to do when the clock is off", () => {
    expect(describeClock({ kind: "drifted", direction: "ahead", minutes: 12 })).toBe(
      "Clock is about 12 minutes ahead of the server. Punch times, late marks and absences will be wrong until you set the time on the device.",
    );
    expect(describeClock({ kind: "drifted", direction: "behind", minutes: 1 })).toContain("1 minute behind the server.");
  });

  it("points at the time zone when the gap is whole hours", () => {
    expect(describeClock({ kind: "drifted", direction: "behind", minutes: 360 })).toContain("time zone is wrong");
    expect(describeClock({ kind: "drifted", direction: "behind", minutes: 61 })).not.toContain("time zone");
  });

  it("is calm when it is fine or not checked", () => {
    expect(describeClock({ kind: "ok", seconds: 30 })).toBe("Clock looks right.");
    expect(describeClock({ kind: "unchecked" })).toContain("not checked yet");
  });
});

describe("office agent clock reports", () => {
  it("knows the office agent by its user agent", () => {
    const from = (ua: string | null) => new Request("http://x/iclock/cdata", ua ? { headers: { "user-agent": ua } } : {});
    expect(isOfficeAgent(from("byTeam-agent/1.0.0"))).toBe(true);
    expect(isOfficeAgent(from("iClock Proxy/1.09"))).toBe(false);
    expect(isOfficeAgent(from(null))).toBe(false);
  });

  it("accepts a whole number of seconds up to a year either way", () => {
    expect(parseReportedOffset("0")).toBe(0);
    expect(parseReportedOffset("-4")).toBe(-4);
    expect(parseReportedOffset("15373")).toBe(15373);
    expect(parseReportedOffset(null)).toBeNull();
    expect(parseReportedOffset("1.5")).toBeNull();
    expect(parseReportedOffset("abc")).toBeNull();
    expect(parseReportedOffset(String(400 * 86400))).toBeNull();
  });
});
