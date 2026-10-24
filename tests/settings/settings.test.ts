import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "@/lib/db-errors";
import { companySettingsSchema, sameSettings } from "@/lib/settings/company";
import { groupByYear, holidaySchema } from "@/lib/settings/holidays";

describe("companySettingsSchema", () => {
  it("coerces form strings, sorts and removes duplicate days", () => {
    const parsed = companySettingsSchema.parse({ name: " Sand'Sun ", weeklyOffDays: ["5", "6", "5"] });
    expect(parsed).toEqual({ name: "Sand'Sun", weeklyOffDays: [5, 6] });
  });

  it("allows no off days while the office has not decided", () => {
    expect(companySettingsSchema.parse({ name: "X", weeklyOffDays: [] }).weeklyOffDays).toEqual([]);
  });

  it("rejects an empty name and days outside 0 to 6", () => {
    expect(companySettingsSchema.safeParse({ name: "  ", weeklyOffDays: [] }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ name: "X", weeklyOffDays: [7] }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ name: "X", weeklyOffDays: ["-1"] }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ name: "X", weeklyOffDays: ["abc"] }).success).toBe(false);
  });
});

describe("sameSettings", () => {
  it("compares name and off days", () => {
    expect(sameSettings({ name: "A", weeklyOffDays: [5, 6] }, { name: "A", weeklyOffDays: [5, 6] })).toBe(true);
    expect(sameSettings({ name: "A", weeklyOffDays: [5] }, { name: "A", weeklyOffDays: [5, 6] })).toBe(false);
    expect(sameSettings({ name: "A", weeklyOffDays: [] }, { name: "B", weeklyOffDays: [] })).toBe(false);
  });
});

describe("holidaySchema", () => {
  it("accepts a real date and trims the name", () => {
    expect(holidaySchema.parse({ date: "2026-02-21", name: " Language Martyrs' Day " })).toEqual({
      date: "2026-02-21",
      name: "Language Martyrs' Day",
    });
  });

  it("rejects impossible dates and empty names", () => {
    expect(holidaySchema.safeParse({ date: "2026-02-30", name: "X" }).success).toBe(false);
    expect(holidaySchema.safeParse({ date: "", name: "X" }).success).toBe(false);
    expect(holidaySchema.safeParse({ date: "2026-02-21", name: " " }).success).toBe(false);
  });
});

describe("groupByYear", () => {
  it("groups and sorts by date", () => {
    const groups = groupByYear([
      { id: "3", date: "2027-01-01", name: "New year" },
      { id: "2", date: "2026-12-16", name: "Victory Day" },
      { id: "1", date: "2026-02-21", name: "Language Martyrs' Day" },
    ]);
    expect(groups.map((g) => g.year)).toEqual(["2026", "2027"]);
    expect(groups[0].holidays.map((h) => h.id)).toEqual(["1", "2"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByYear([])).toEqual([]);
  });
});

describe("isUniqueViolation", () => {
  it("finds code 23505 on the error or its cause", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(new Error("wrapped", { cause: { code: "23505" } }))).toBe(true);
  });

  it("is false for other errors", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
