import { describe, expect, it } from "vitest";

import { describeRuleSet, MAX_LATE_AMOUNT, MAX_LATES_PER_DAY, ruleSetForMonth, ruleSetSchema } from "@/lib/payroll/rules";

const base = {
  effectiveFromMonth: "2026-11",
  lateMode: "days_per_lates",
  lateEveryN: "3",
  lateAmount: "",
  deductionBase: "gross",
  divisor: "working_days",
  unpaidLeaveAsAbsent: true,
};

describe("ruleSetSchema", () => {
  it("accepts the rules the office chose", () => {
    expect(ruleSetSchema.parse(base)).toEqual({
      effectiveFromMonth: "2026-11",
      lateMode: "days_per_lates",
      lateEveryN: 3,
      lateAmount: null,
      deductionBase: "gross",
      divisor: "working_days",
      unpaidLeaveAsAbsent: true,
    });
  });

  it("needs the number that belongs to the late mode", () => {
    expect(ruleSetSchema.safeParse({ ...base, lateEveryN: "" }).success).toBe(false);
    expect(ruleSetSchema.safeParse({ ...base, lateMode: "fixed_per_late", lateEveryN: "", lateAmount: "" }).success).toBe(false);
  });

  it("refuses zero, fractions and words for lates per day", () => {
    for (const lateEveryN of ["0", "2.5", "-3", "three", "3 lates"]) {
      expect(ruleSetSchema.safeParse({ ...base, lateEveryN }).success, lateEveryN).toBe(false);
    }
    expect(ruleSetSchema.safeParse({ ...base, lateEveryN: "1" }).success).toBe(true);
    expect(ruleSetSchema.safeParse({ ...base, lateEveryN: String(MAX_LATES_PER_DAY) }).success).toBe(true);
    expect(ruleSetSchema.safeParse({ ...base, lateEveryN: String(MAX_LATES_PER_DAY + 1) }).success).toBe(false);
  });

  it("reads a fixed amount with up to two decimals and keeps it as text", () => {
    const fixed = { ...base, lateMode: "fixed_per_late", lateEveryN: "" };
    expect(ruleSetSchema.parse({ ...fixed, lateAmount: "50" }).lateAmount).toBe("50");
    expect(ruleSetSchema.parse({ ...fixed, lateAmount: "50.25" }).lateAmount).toBe("50.25");
    expect(ruleSetSchema.parse({ ...fixed, lateAmount: "0" }).lateAmount).toBe("0");
    for (const lateAmount of ["-5", "5.123", "fifty", "1e3", ""]) {
      expect(ruleSetSchema.safeParse({ ...fixed, lateAmount }).success, lateAmount).toBe(false);
    }
    expect(ruleSetSchema.safeParse({ ...fixed, lateAmount: String(MAX_LATE_AMOUNT + 1) }).success).toBe(false);
  });

  it("drops the number that does not belong to the chosen mode", () => {
    const days = ruleSetSchema.parse({ ...base, lateAmount: "50" });
    expect(days.lateAmount).toBeNull();
    const fixed = ruleSetSchema.parse({ ...base, lateMode: "fixed_per_late", lateAmount: "50" });
    expect(fixed.lateEveryN).toBeNull();
    const none = ruleSetSchema.parse({ ...base, lateMode: "none", lateAmount: "50" });
    expect([none.lateEveryN, none.lateAmount]).toEqual([null, null]);
  });

  it("needs a real month, a base and a divisor", () => {
    for (const effectiveFromMonth of ["", "2026-13", "2026-11-01", "Nov 2026", "1800-01"]) {
      expect(ruleSetSchema.safeParse({ ...base, effectiveFromMonth }).success, effectiveFromMonth).toBe(false);
    }
    expect(ruleSetSchema.safeParse({ ...base, deductionBase: "net" }).success).toBe(false);
    expect(ruleSetSchema.safeParse({ ...base, divisor: "28" }).success).toBe(false);
    expect(ruleSetSchema.safeParse({ ...base, lateMode: undefined }).success).toBe(false);
  });
});

describe("ruleSetForMonth", () => {
  const rules = [
    { id: "a", effectiveFromMonth: "2026-01" },
    { id: "c", effectiveFromMonth: "2027-03" },
    { id: "b", effectiveFromMonth: "2026-07" },
  ];

  it("uses the latest rules that have started", () => {
    expect(ruleSetForMonth(rules, "2026-01")?.id).toBe("a");
    expect(ruleSetForMonth(rules, "2026-06")?.id).toBe("a");
    expect(ruleSetForMonth(rules, "2026-07")?.id).toBe("b");
    expect(ruleSetForMonth(rules, "2027-02")?.id).toBe("b");
    expect(ruleSetForMonth(rules, "2027-03")?.id).toBe("c");
    expect(ruleSetForMonth(rules, "2030-12")?.id).toBe("c");
  });

  it("finds nothing before the first rules or when there are none", () => {
    expect(ruleSetForMonth(rules, "2025-12")).toBeNull();
    expect(ruleSetForMonth([], "2026-01")).toBeNull();
  });
});

describe("describeRuleSet", () => {
  const rule = { lateMode: "days_per_lates", lateEveryN: 3, lateAmount: null, deductionBase: "gross", divisor: "working_days", unpaidLeaveAsAbsent: true } as const;

  it("says the decided rules in plain words", () => {
    expect(describeRuleSet(rule)).toEqual([
      "A day of pay is gross salary divided by the number of working days in the month.",
      "Every 3 lates cost one day of pay.",
      "Unpaid leave days are deducted like absent days.",
    ]);
  });

  it("covers the other choices", () => {
    expect(describeRuleSet({ ...rule, deductionBase: "basic", divisor: "thirty", lateEveryN: 1 })).toEqual([
      "A day of pay is basic salary divided by 30.",
      "Every late costs one day of pay.",
      "Unpaid leave days are deducted like absent days.",
    ]);
    expect(describeRuleSet({ ...rule, divisor: "month_days", lateMode: "fixed_per_late", lateEveryN: null, lateAmount: "50.00", unpaidLeaveAsAbsent: false })).toEqual([
      "A day of pay is gross salary divided by the number of days in the month.",
      "Every late costs 50 taka.",
      "Unpaid leave days are not deducted.",
    ]);
    expect(describeRuleSet({ ...rule, lateMode: "none", lateEveryN: null })[1]).toBe("Lates are shown but cost nothing.");
  });
});
