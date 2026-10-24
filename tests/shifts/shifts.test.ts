import { describe, expect, it } from "vitest";

import { formatShiftLength, shiftSchema, timeToMinutes, toHm } from "@/lib/shifts/shifts";

const valid = { name: "Day", startTime: "09:00", endTime: "18:00", graceMinutes: "10" };

describe("timeToMinutes", () => {
  it("reads HH:MM and HH:MM:SS", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("18:00:00")).toBe(1080);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("rejects anything else", () => {
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("9:00")).toBeNull();
    expect(timeToMinutes("09:60")).toBeNull();
    expect(timeToMinutes("")).toBeNull();
  });
});

describe("toHm", () => {
  it("drops the seconds", () => {
    expect(toHm("09:00:00")).toBe("09:00");
    expect(toHm("09:00")).toBe("09:00");
  });
});

describe("formatShiftLength", () => {
  it("shows hours and minutes", () => {
    expect(formatShiftLength("09:00", "18:00")).toBe("9 h");
    expect(formatShiftLength("09:00", "17:30")).toBe("8 h 30 min");
  });

  it("is empty for an invalid range", () => {
    expect(formatShiftLength("18:00", "09:00")).toBe("");
    expect(formatShiftLength("", "09:00")).toBe("");
  });
});

describe("shiftSchema", () => {
  it("accepts a valid shift and turns grace into a number", () => {
    expect(shiftSchema.parse(valid)).toEqual({ name: "Day", startTime: "09:00", endTime: "18:00", graceMinutes: 10 });
  });

  it("trims the name and drops seconds from times", () => {
    const parsed = shiftSchema.parse({ ...valid, name: " Day ", startTime: "09:00:00", endTime: "18:00:00" });
    expect(parsed).toMatchObject({ name: "Day", startTime: "09:00", endTime: "18:00" });
  });

  it("allows zero grace minutes", () => {
    expect(shiftSchema.parse({ ...valid, graceMinutes: "0" }).graceMinutes).toBe(0);
  });

  it("rejects an end that is not after the start", () => {
    expect(shiftSchema.safeParse({ ...valid, endTime: "09:00" }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...valid, startTime: "22:00", endTime: "06:00" }).success).toBe(false);
  });

  it("rejects bad grace minutes", () => {
    expect(shiftSchema.safeParse({ ...valid, graceMinutes: "-1" }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...valid, graceMinutes: "1.5" }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...valid, graceMinutes: "" }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...valid, graceMinutes: "abc" }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...valid, graceMinutes: "181" }).success).toBe(false);
  });

  it("rejects an empty name and missing times", () => {
    expect(shiftSchema.safeParse({ ...valid, name: " " }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...valid, startTime: "" }).success).toBe(false);
    expect(shiftSchema.safeParse({ ...valid, endTime: "" }).success).toBe(false);
  });
});
