import { describe, expect, it } from "vitest";

import {
  centsToMoney,
  formatTaka,
  hundredthsToPercent,
  parseMoneyToCents,
  parsePercentToHundredths,
  percentOfCents,
} from "@/lib/salary/money";
import { salaryBreakdown, salaryInputSchema, structureForMonth } from "@/lib/salary/salary";

const valid = {
  gross: "30000",
  basicPct: "60",
  housePct: "25",
  medicalPct: "10",
  conveyancePct: "5",
  effectiveMonth: "2026-01",
};

describe("parseMoneyToCents", () => {
  it("reads whole and decimal amounts, with or without commas", () => {
    expect(parseMoneyToCents("30000")).toBe(3_000_000);
    expect(parseMoneyToCents("30000.5")).toBe(3_000_050);
    expect(parseMoneyToCents("30,000.50")).toBe(3_000_050);
    expect(parseMoneyToCents(" 0.05 ")).toBe(5);
  });

  it("rejects bad amounts", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1e5", "12 000", "30000.", ".5", "99999999999"]) {
      expect(parseMoneyToCents(bad), bad).toBeNull();
    }
  });
});

describe("centsToMoney", () => {
  it("always shows two decimals", () => {
    expect(centsToMoney(3_000_050)).toBe("30000.50");
    expect(centsToMoney(5)).toBe("0.05");
    expect(centsToMoney(0)).toBe("0.00");
    expect(centsToMoney(1_000)).toBe("10.00");
  });
});

describe("percent helpers", () => {
  it("reads 0 to 100 with up to two decimals", () => {
    expect(parsePercentToHundredths("60")).toBe(6000);
    expect(parsePercentToHundredths("62.5")).toBe(6250);
    expect(parsePercentToHundredths("100")).toBe(10_000);
    expect(parsePercentToHundredths("0")).toBe(0);
    expect(hundredthsToPercent(6250)).toBe("62.50");
  });

  it("rejects out of range and malformed values", () => {
    for (const bad of ["", "-1", "100.01", "101", "1.234", "abc", "5%"]) {
      expect(parsePercentToHundredths(bad), bad).toBeNull();
    }
  });
});

describe("percentOfCents", () => {
  it("takes a percentage exactly", () => {
    expect(percentOfCents(3_000_000, 6000)).toBe(1_800_000);
    expect(percentOfCents(3_000_000, 2500)).toBe(750_000);
  });

  it("rounds half up to the nearest cent", () => {
    expect(percentOfCents(1, 5000)).toBe(1); // 0.5 cent rounds up
    expect(percentOfCents(1, 4999)).toBe(0);
    expect(percentOfCents(10_001, 3333)).toBe(3333); // 3333.3333 rounds down
  });

  it("stays exact for the largest amount", () => {
    expect(percentOfCents(999_999_999_999, 10_000)).toBe(999_999_999_999);
  });
});

describe("formatTaka", () => {
  it("uses lakh grouping with two decimals", () => {
    expect(formatTaka("30000")).toBe("30,000.00");
    expect(formatTaka("100000.5")).toBe("1,00,000.50");
    expect(formatTaka("1234567.00")).toBe("12,34,567.00");
  });
});

describe("salaryInputSchema", () => {
  it("normalises amounts and turns the month into the first day", () => {
    expect(salaryInputSchema.parse({ ...valid, gross: "30,000.5", basicPct: "52.5" })).toEqual({
      gross: "30000.50",
      basicPct: "52.50",
      housePct: "25.00",
      medicalPct: "10.00",
      conveyancePct: "5.00",
      effectiveFrom: "2026-01-01",
    });
  });

  it("allows percentages that leave something over, and zero for a component", () => {
    expect(salaryInputSchema.safeParse({ ...valid, housePct: "0", medicalPct: "0", conveyancePct: "0" }).success).toBe(true);
  });

  it("allows exactly 100 and rejects more", () => {
    expect(salaryInputSchema.safeParse({ ...valid, basicPct: "60", housePct: "30", medicalPct: "5", conveyancePct: "5" }).success).toBe(true);
    const over = salaryInputSchema.safeParse({ ...valid, basicPct: "60", housePct: "30", medicalPct: "5", conveyancePct: "5.01" });
    expect(over.success).toBe(false);
    expect(over.error?.issues[0].message).toBe("The percentages add up to more than 100.");
  });

  it("rejects zero, negative or malformed gross", () => {
    for (const gross of ["0", "0.00", "-1", "", "abc", "1.234"]) {
      expect(salaryInputSchema.safeParse({ ...valid, gross }).success, gross).toBe(false);
    }
  });

  it("rejects a gross larger than the column holds", () => {
    expect(salaryInputSchema.safeParse({ ...valid, gross: "10000000000" }).success).toBe(false);
  });

  it("needs a real month and every percentage", () => {
    expect(salaryInputSchema.safeParse({ ...valid, effectiveMonth: "" }).success).toBe(false);
    expect(salaryInputSchema.safeParse({ ...valid, effectiveMonth: "2026-13" }).success).toBe(false);
    expect(salaryInputSchema.safeParse({ ...valid, basicPct: "" }).success).toBe(false);
  });
});

describe("salaryBreakdown", () => {
  it("splits gross by the percentages", () => {
    expect(
      salaryBreakdown({ gross: "30000.00", basicPct: "60.00", housePct: "25.00", medicalPct: "10.00", conveyancePct: "5.00" }),
    ).toEqual({ basic: "18000.00", house: "7500.00", medical: "3000.00", conveyance: "1500.00", other: "0.00" });
  });

  it("leaves the unallocated rest as other", () => {
    const b = salaryBreakdown({ gross: "10000.00", basicPct: "50.00", housePct: "20.00", medicalPct: "10.00", conveyancePct: "0.00" });
    expect(b).toMatchObject({ basic: "5000.00", house: "2000.00", medical: "1000.00", conveyance: "0.00", other: "2000.00" });
  });

  it("never goes over gross when the percentages add up to 100", () => {
    // Rounding each part on its own would give 1,000,102 cents here, one more than gross.
    const b = salaryBreakdown({ gross: "10001.01", basicPct: "33.33", housePct: "33.33", medicalPct: "33.33", conveyancePct: "0.01" });
    expect(b.other).toBe("0.00");
  });

  it("parts plus other always add back to gross", () => {
    const b = salaryBreakdown({ gross: "10001.01", basicPct: "33.33", housePct: "33.33", medicalPct: "33.33", conveyancePct: "0.01" });
    const total = [b.basic, b.house, b.medical, b.conveyance, b.other].reduce((sum, v) => sum + parseMoneyToCents(v)!, 0);
    expect(total).toBe(1_000_101);
  });
});

describe("structureForMonth", () => {
  const list = [
    { effectiveFrom: "2026-07-01", gross: "40000.00" },
    { effectiveFrom: "2026-01-01", gross: "30000.00" },
    { effectiveFrom: "2026-04-01", gross: "35000.00" },
  ];

  it("picks the latest version starting on or before the month", () => {
    expect(structureForMonth(list, "2026-01")?.gross).toBe("30000.00");
    expect(structureForMonth(list, "2026-03")?.gross).toBe("30000.00");
    expect(structureForMonth(list, "2026-04")?.gross).toBe("35000.00");
    expect(structureForMonth(list, "2026-12")?.gross).toBe("40000.00");
  });

  it("is null before the first version and for an empty list", () => {
    expect(structureForMonth(list, "2025-12")).toBeNull();
    expect(structureForMonth([], "2026-01")).toBeNull();
  });
});
