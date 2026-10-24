import { describe, expect, it } from "vitest";

import { describeAge, deviceStatus, newDeviceSchema, OFFLINE_AFTER_MINUTES } from "@/lib/devices/devices";

const now = new Date("2026-10-24T06:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("deviceStatus", () => {
  it("is never when the device has not connected", () => {
    expect(deviceStatus(null, now)).toBe("never");
  });

  it("is online up to and including 15 minutes", () => {
    expect(OFFLINE_AFTER_MINUTES).toBe(15);
    expect(deviceStatus(minutesAgo(0), now)).toBe("online");
    expect(deviceStatus(minutesAgo(14.9), now)).toBe("online");
    expect(deviceStatus(minutesAgo(15), now)).toBe("online");
  });

  it("is offline after 15 minutes", () => {
    expect(deviceStatus(minutesAgo(15.1), now)).toBe("offline");
    expect(deviceStatus(minutesAgo(600), now)).toBe("offline");
  });

  it("treats a last-seen time slightly ahead of now as online", () => {
    expect(deviceStatus(new Date(now.getTime() + 5_000), now)).toBe("online");
  });
});

describe("describeAge", () => {
  it("is null before the first contact", () => {
    expect(describeAge(null, now)).toBeNull();
  });

  it("reads naturally at each scale", () => {
    expect(describeAge(minutesAgo(0.2), now)).toBe("Just now");
    expect(describeAge(minutesAgo(5), now)).toBe("5 min ago");
    expect(describeAge(minutesAgo(59), now)).toBe("59 min ago");
    expect(describeAge(minutesAgo(60), now)).toBe("1 h ago");
    expect(describeAge(minutesAgo(47 * 60), now)).toBe("47 h ago");
    expect(describeAge(minutesAgo(72 * 60), now)).toBe("3 days ago");
  });

  it("never shows a negative age", () => {
    expect(describeAge(new Date(now.getTime() + 60_000), now)).toBe("Just now");
  });
});

describe("newDeviceSchema", () => {
  it("accepts a typical serial number and trims both fields", () => {
    expect(newDeviceSchema.parse({ serialNo: " CJDE194960123 ", name: " Front door " })).toEqual({
      serialNo: "CJDE194960123",
      name: "Front door",
    });
  });

  it("rejects serial numbers with spaces, symbols or the wrong length", () => {
    for (const bad of ["", "AB", "CJDE 1949", "SN#1", "x".repeat(65)]) {
      expect(newDeviceSchema.safeParse({ serialNo: bad, name: "Door" }).success, bad).toBe(false);
    }
  });

  it("needs a name", () => {
    expect(newDeviceSchema.safeParse({ serialNo: "CJDE1949", name: "  " }).success).toBe(false);
  });
});
