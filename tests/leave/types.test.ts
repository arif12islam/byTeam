import { describe, expect, it } from "vitest";

import { leaveTypeSchema, leaveYearBasisSchema, MAX_YEARLY_QUOTA } from "@/lib/leave/types";

const base = { name: "Casual leave", yearlyQuota: "10", isPaid: true };

describe("leaveTypeSchema", () => {
  it("accepts a normal type and trims the name", () => {
    expect(leaveTypeSchema.parse({ ...base, name: "  Casual leave  " })).toEqual({ name: "Casual leave", yearlyQuota: 10, isPaid: true, active: true });
  });

  it("reads an empty quota as no limit, and zero as a real quota", () => {
    expect(leaveTypeSchema.parse({ ...base, yearlyQuota: "" }).yearlyQuota).toBeNull();
    expect(leaveTypeSchema.parse({ ...base, yearlyQuota: "   " }).yearlyQuota).toBeNull();
    expect(leaveTypeSchema.parse({ ...base, yearlyQuota: undefined }).yearlyQuota).toBeNull();
    expect(leaveTypeSchema.parse({ ...base, yearlyQuota: "0" }).yearlyQuota).toBe(0);
    expect(leaveTypeSchema.parse({ ...base, yearlyQuota: 12 }).yearlyQuota).toBe(12);
  });

  it("refuses half days, negatives, words and a quota longer than a year", () => {
    for (const yearlyQuota of ["1.5", "-2", "ten", "1e2", "10 days"]) {
      expect(leaveTypeSchema.safeParse({ ...base, yearlyQuota }).success, yearlyQuota).toBe(false);
    }
    expect(leaveTypeSchema.safeParse({ ...base, yearlyQuota: String(MAX_YEARLY_QUOTA) }).success).toBe(true);
    expect(leaveTypeSchema.safeParse({ ...base, yearlyQuota: String(MAX_YEARLY_QUOTA + 1) }).success).toBe(false);
  });

  it("needs a name, within 60 characters", () => {
    expect(leaveTypeSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(leaveTypeSchema.safeParse({ ...base, name: "x".repeat(61) }).success).toBe(false);
    expect(leaveTypeSchema.safeParse({ ...base, name: "x".repeat(60) }).success).toBe(true);
  });

  it("needs to know whether the leave is paid", () => {
    expect(leaveTypeSchema.safeParse({ name: "Sick", yearlyQuota: "5" }).success).toBe(false);
  });
});

describe("leaveYearBasisSchema", () => {
  it("accepts the two choices only", () => {
    expect(leaveYearBasisSchema.parse("calendar")).toBe("calendar");
    expect(leaveYearBasisSchema.parse("anniversary")).toBe("anniversary");
    expect(leaveYearBasisSchema.safeParse("fiscal").success).toBe(false);
    expect(leaveYearBasisSchema.safeParse("").success).toBe(false);
  });
});
