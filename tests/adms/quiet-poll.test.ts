import { describe, expect, it } from "vitest";

import { createPollMemo, DEFAULT_QUIET_MINUTES, offlineAfterMinutes, quietMinutes } from "@/lib/adms/quiet-poll";

const t0 = new Date("2026-10-25T06:00:00Z");
const later = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const device = { id: "dev-1", serialNo: "CJDE194960123" };

describe("quietMinutes", () => {
  it("is 20 when not set or blank", () => {
    expect(DEFAULT_QUIET_MINUTES).toBe(20);
    expect(quietMinutes(undefined)).toBe(20);
    expect(quietMinutes("")).toBe(20);
    expect(quietMinutes("  ")).toBe(20);
  });

  it("reads a whole number, with 0 meaning off", () => {
    expect(quietMinutes("0")).toBe(0);
    expect(quietMinutes("5")).toBe(5);
    expect(quietMinutes(" 30 ")).toBe(30);
  });

  it("caps at an hour", () => {
    expect(quietMinutes("600")).toBe(60);
  });

  it("falls back to the default for anything else", () => {
    expect(quietMinutes("-1")).toBe(20);
    expect(quietMinutes("2.5")).toBe(20);
    expect(quietMinutes("ten")).toBe(20);
  });
});

describe("offlineAfterMinutes", () => {
  it("is two windows and 5 minutes with quiet polling", () => {
    expect(offlineAfterMinutes(20)).toBe(45);
    expect(offlineAfterMinutes(5)).toBe(15);
  });

  it("is 15 minutes without quiet polling", () => {
    expect(offlineAfterMinutes(0)).toBe(15);
  });
});

describe("createPollMemo", () => {
  it("asks the database for a device it has not seen", () => {
    expect(createPollMemo(20 * 60_000).recall(device.serialNo, t0)).toBeUndefined();
  });

  it("answers from memory within the window, then asks again", () => {
    const memo = createPollMemo(20 * 60_000);
    memo.remember(device.serialNo, device, t0);
    expect(memo.recall(device.serialNo, later(0.5))).toEqual(device);
    expect(memo.recall(device.serialNo, later(19.9))).toEqual(device);
    expect(memo.recall(device.serialNo, later(20))).toBeUndefined();
    // Once expired it stays forgotten until the database answers again.
    expect(memo.recall(device.serialNo, later(0.5))).toBeUndefined();
  });

  it("remembers a refusal too, so a switched-off device does not wake the database", () => {
    const memo = createPollMemo(20 * 60_000);
    memo.remember("UNKNOWN01", null, t0);
    expect(memo.recall("UNKNOWN01", later(1))).toBeNull();
  });

  it("forgets one device or all of them", () => {
    const memo = createPollMemo(20 * 60_000);
    memo.remember("A1", device, t0);
    memo.remember("B2", device, t0);
    memo.forget("A1");
    expect(memo.recall("A1", later(1))).toBeUndefined();
    expect(memo.recall("B2", later(1))).toEqual(device);
    memo.forget();
    expect(memo.recall("B2", later(1))).toBeUndefined();
  });

  it("treats a clock that went backwards as expired", () => {
    const memo = createPollMemo(20 * 60_000);
    memo.remember(device.serialNo, device, t0);
    expect(memo.recall(device.serialNo, later(-1))).toBeUndefined();
  });

  it("never remembers anything with a window of 0", () => {
    const memo = createPollMemo(0);
    memo.remember(device.serialNo, device, t0);
    expect(memo.recall(device.serialNo, t0)).toBeUndefined();
  });

  it("keeps at most 1000 serial numbers, dropping the oldest", () => {
    const memo = createPollMemo(20 * 60_000);
    for (let i = 0; i < 1001; i += 1) memo.remember(`SN${i}`, null, t0);
    expect(memo.recall("SN0", later(1))).toBeUndefined();
    expect(memo.recall("SN1", later(1))).toBeNull();
    expect(memo.recall("SN1000", later(1))).toBeNull();
  });
});
