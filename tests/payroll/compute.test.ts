import { describe, expect, it } from "vitest";

import type { AttendanceStatus } from "@/db/schema/attendance";
import {
  computePayroll,
  countWorkingDays,
  fromPaisa,
  mulDivRound,
  roundToTaka,
  toPaisa,
  type PayrollInput,
  type PayRules,
} from "@/lib/payroll/compute";
import { eachDate } from "@/lib/time";

// November 2026 has 30 days and starts on a Sunday. With Friday and Saturday off it has 8 days off and 22 working days.
const NOV = "2026-11";
const FRI_SAT = { weeklyOffDays: [5, 6], holidayDates: new Set<string>() };

/** The office rules: gross, working days, every 3 lates cost one day, unpaid leave deducted. */
const OFFICE_RULES: PayRules = {
  lateMode: "days_per_lates",
  lateEveryN: 3,
  lateAmount: null,
  deductionBase: "gross",
  divisor: "working_days",
  unpaidLeaveAsAbsent: true,
};

/** Every date of November as a present working day or a weekly off, then the given dates replaced. */
function november(overrides: Record<string, AttendanceStatus> = {}) {
  return eachDate("2026-11-01", "2026-11-30").map((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const base: AttendanceStatus = weekday === 5 || weekday === 6 ? "weekly_off" : "present";
    return { date, status: overrides[date] ?? base };
  });
}

/** Working days of November, in order, to hand out statuses to. */
const WORKING = eachDate("2026-11-01", "2026-11-30").filter((d) => ![5, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));

function input(over: Partial<PayrollInput> = {}): PayrollInput {
  return {
    month: NOV,
    employee: { joinDate: "2025-01-01", exitDate: null },
    salary: { gross: "30000.00", basicPct: "50.00" },
    rules: OFFICE_RULES,
    workingDays: countWorkingDays(NOV, FRI_SAT),
    days: november(),
    adjustments: [],
    ...over,
  };
}

describe("money helpers", () => {
  it("reads and writes whole paisa", () => {
    expect(toPaisa("1234.56")).toBe(123456);
    expect(toPaisa("1234.5")).toBe(123450);
    expect(toPaisa("1234")).toBe(123400);
    expect(toPaisa("0.05")).toBe(5);
    expect(fromPaisa(123456)).toBe("1234.56");
    expect(fromPaisa(5)).toBe("0.05");
    expect(fromPaisa(0)).toBe("0.00");
    expect(fromPaisa(-123456)).toBe("-1234.56");
  });

  it("refuses text that is not an amount", () => {
    for (const bad of ["", "abc", "-5", "1.234", "1,000", "1e3", "10 taka"]) {
      expect(() => toPaisa(bad), bad).toThrow();
    }
  });

  it("divides and rounds half up without drifting", () => {
    expect(mulDivRound(1, 1, 2)).toBe(1); // 0.5 goes up
    expect(mulDivRound(1, 1, 3)).toBe(0);
    expect(mulDivRound(2, 1, 3)).toBe(1);
    expect(mulDivRound(3000000, 2, 22)).toBe(272727);
    // Too big for a float to hold exactly, still right.
    expect(mulDivRound(9_007_199_254_740_991, 31, 31)).toBe(9_007_199_254_740_991);
  });

  it("rounds net pay to a whole taka, halves up", () => {
    expect(roundToTaka(100049)).toBe(100000);
    expect(roundToTaka(100050)).toBe(100100);
    expect(roundToTaka(2268182)).toBe(2268200);
    expect(roundToTaka(0)).toBe(0);
    expect(roundToTaka(-50)).toBe(0);
    expect(roundToTaka(-51)).toBe(-100);
  });
});

describe("countWorkingDays", () => {
  it("leaves out weekly off days", () => {
    expect(countWorkingDays(NOV, FRI_SAT)).toBe(22);
  });

  it("leaves out holidays, and counts a holiday on a weekly off day once", () => {
    expect(countWorkingDays(NOV, { ...FRI_SAT, holidayDates: new Set(["2026-11-10"]) })).toBe(21); // a Tuesday
    expect(countWorkingDays(NOV, { ...FRI_SAT, holidayDates: new Set(["2026-11-06"]) })).toBe(22); // a Friday
  });

  it("works with other off days and other months", () => {
    expect(countWorkingDays(NOV, { weeklyOffDays: [5], holidayDates: new Set() })).toBe(26);
    expect(countWorkingDays("2028-02", { weeklyOffDays: [], holidayDates: new Set() })).toBe(29);
  });
});

describe("computePayroll with the office rules", () => {
  it("pays the full gross for a clean month", () => {
    const item = computePayroll(input());
    expect(item).toMatchObject({ payableDays: 30, absentDays: 0, lateCount: 0, unpaidLeaveDays: 0, gross: "30000.00", deductions: "0.00", additions: "0.00", net: "30000.00" });
    expect(item.breakdown.lines).toEqual([{ code: "salary", label: "Salary for 30 of 30 days", amount: "30000.00", sign: "+" }]);
    expect(item.breakdown.warnings).toEqual([]);
  });

  it("works a full month by hand: 2 absent, 7 late, 1 unpaid leave, an advance and a bonus", () => {
    const days = november({
      [WORKING[0]]: "absent",
      [WORKING[1]]: "absent",
      [WORKING[2]]: "leave_unpaid",
      ...Object.fromEntries(WORKING.slice(3, 10).map((d) => [d, "late" as const])),
    });
    const item = computePayroll(
      input({
        days,
        adjustments: [
          { type: "advance", amount: "1000.00" },
          { type: "bonus", amount: "500.00" },
        ],
      }),
    );

    // A day is 30000 / 22 = 1363.6363...
    // absent 2 days = 2727.27, unpaid leave 1 day = 1363.64, 7 lates = 2 whole days = 2727.27, advance 1000.
    expect(item.absentDays).toBe(2);
    expect(item.unpaidLeaveDays).toBe(1);
    expect(item.lateCount).toBe(7);
    expect(item.deductions).toBe("7818.18");
    expect(item.additions).toBe("500.00");
    expect(item.breakdown.netBeforeRounding).toBe("22681.82");
    expect(item.net).toBe("22682.00");
    expect(item.breakdown.lateDaysDeducted).toBe(2);
    expect(item.breakdown.divisorDays).toBe(22);
    expect(item.breakdown.dailyRate).toBe("1363.64");
    expect(item.breakdown.lines.map((l) => [l.code, l.amount, l.sign])).toEqual([
      ["salary", "30000.00", "+"],
      ["absent", "2727.27", "-"],
      ["unpaid_leave", "1363.64", "-"],
      ["late", "2727.27", "-"],
      ["advance", "1000.00", "-"],
      ["bonus", "500.00", "+"],
    ]);
    expect(item.breakdown.lines.find((l) => l.code === "late")?.label).toBe("Late, 7 times (2 days deducted)");
    expect(item.breakdown.counts).toMatchObject({ present: 12, late: 7, absent: 2, leaveUnpaid: 1, weeklyOff: 8, holiday: 0, missing: 0 });
  });

  it("does not charge for lates until the third one", () => {
    const lates = (n: number) => november(Object.fromEntries(WORKING.slice(0, n).map((d) => [d, "late" as const])));
    expect(computePayroll(input({ days: lates(2) })).deductions).toBe("0.00");
    expect(computePayroll(input({ days: lates(3) })).deductions).toBe("1363.64");
    expect(computePayroll(input({ days: lates(5) })).deductions).toBe("1363.64");
    expect(computePayroll(input({ days: lates(6) })).deductions).toBe("2727.27");
  });

  it("does not charge for paid leave, weekly offs or holidays", () => {
    const days = november({ [WORKING[0]]: "leave_paid", [WORKING[1]]: "holiday", [WORKING[2]]: "holiday" });
    const item = computePayroll(input({ days }));
    expect(item.net).toBe("30000.00");
    expect(item.breakdown.counts).toMatchObject({ leavePaid: 1, holiday: 2 });
  });

  it("pro-rates the gross for someone who joined mid-month", () => {
    // Joined Wednesday 11 November: employed 11 to 30, 20 days, so 30000 x 20 / 30 = 20000.
    const days = november({ [WORKING[10]]: "absent" }).filter((d) => d.date >= "2026-11-11");
    const item = computePayroll(input({ employee: { joinDate: "2026-11-11", exitDate: null }, days }));
    expect(item.payableDays).toBe(20);
    expect(item.gross).toBe("20000.00");
    // The day still costs 30000 / 22 of the whole month's working days.
    expect(item.deductions).toBe("1363.64");
    expect(item.net).toBe("18636.00");
    expect(item.breakdown).toMatchObject({ employedFrom: "2026-11-11", employedTo: "2026-11-30" });
    expect(item.breakdown.lines[0].label).toBe("Salary for 20 of 30 days");
  });

  it("pro-rates the gross for someone who left mid-month, counting the last day", () => {
    const days = november().filter((d) => d.date <= "2026-11-15");
    const item = computePayroll(input({ employee: { joinDate: "2025-01-01", exitDate: "2026-11-15" }, days }));
    expect(item.payableDays).toBe(15);
    expect(item.gross).toBe("15000.00");
    expect(item.net).toBe("15000.00");
    expect(item.breakdown).toMatchObject({ employedFrom: "2026-11-01", employedTo: "2026-11-15" });
  });

  it("handles joining and leaving in the same month", () => {
    const item = computePayroll(input({ employee: { joinDate: "2026-11-10", exitDate: "2026-11-19" }, days: [] }));
    expect(item.payableDays).toBe(10);
    expect(item.gross).toBe("10000.00");
  });

  it("pays nothing for a month outside the employment", () => {
    for (const employee of [
      { joinDate: "2026-12-01", exitDate: null },
      { joinDate: "2025-01-01", exitDate: "2026-10-31" },
    ]) {
      const item = computePayroll(input({ employee, days: [] }));
      expect(item).toMatchObject({ payableDays: 0, gross: "0.00", deductions: "0.00", net: "0.00" });
      expect(item.breakdown).toMatchObject({ employedFrom: null, employedTo: null });
    }
  });

  it("ignores attendance rows outside the employment dates", () => {
    const item = computePayroll(input({ employee: { joinDate: "2026-11-11", exitDate: null }, days: november({ [WORKING[0]]: "absent" }) }));
    expect(item.absentDays).toBe(0);
    expect(item.breakdown.counts.missing).toBe(0);
  });

  it("warns about days with no attendance row and charges nothing for them", () => {
    const item = computePayroll(input({ days: november().slice(0, 25) }));
    expect(item.breakdown.counts.missing).toBe(5);
    expect(item.breakdown.warnings).toEqual(["Attendance is missing for 5 days. Those days cost nothing."]);
    expect(item.net).toBe("30000.00");
    expect(computePayroll(input({ days: november().slice(0, 29) })).breakdown.warnings[0]).toContain("1 day.");
  });

  it("takes the later row when a date appears twice", () => {
    const days = [...november(), { date: WORKING[0], status: "absent" as const }];
    expect(computePayroll(input({ days })).absentDays).toBe(1);
  });

  it("gives the same answer whatever order the days come in", () => {
    const days = november({ [WORKING[0]]: "absent", [WORKING[4]]: "late" });
    expect(computePayroll(input({ days: [...days].reverse() }))).toEqual(computePayroll(input({ days })));
  });
});

describe("computePayroll with other rules", () => {
  it("works a day from basic pay, divided by 30, with a fixed amount per late", () => {
    const rules: PayRules = { ...OFFICE_RULES, deductionBase: "basic", divisor: "thirty", lateMode: "fixed_per_late", lateEveryN: null, lateAmount: "50.00" };
    const days = november({
      [WORKING[0]]: "absent",
      [WORKING[1]]: "absent",
      [WORKING[2]]: "absent",
      ...Object.fromEntries(WORKING.slice(3, 7).map((d) => [d, "late" as const])),
    });
    const item = computePayroll(input({ rules, days }));
    // Basic is 50% of 30000 = 15000, a day is 15000 / 30 = 500. 3 absent = 1500. 4 lates x 50 = 200.
    expect(item.breakdown).toMatchObject({ baseAmount: "15000.00", divisorDays: 30, dailyRate: "500.00" });
    expect(item.deductions).toBe("1700.00");
    expect(item.net).toBe("28300.00");
    expect(item.breakdown.lines.find((l) => l.code === "late")?.label).toBe("Late, 4 times");
  });

  it("divides by the days in the month when asked", () => {
    const rules: PayRules = { ...OFFICE_RULES, divisor: "month_days" };
    const item = computePayroll(input({ rules, days: november({ [WORKING[0]]: "absent" }) }));
    expect(item.breakdown.divisorDays).toBe(30);
    expect(item.deductions).toBe("1000.00");
  });

  it("charges nothing for lates when the rules say so", () => {
    const rules: PayRules = { ...OFFICE_RULES, lateMode: "none", lateEveryN: null };
    const days = november(Object.fromEntries(WORKING.slice(0, 9).map((d) => [d, "late" as const])));
    const item = computePayroll(input({ rules, days }));
    expect(item.lateCount).toBe(9);
    expect(item.deductions).toBe("0.00");
  });

  it("charges every late a day when 1 late costs a day", () => {
    const rules: PayRules = { ...OFFICE_RULES, lateEveryN: 1 };
    const item = computePayroll(input({ rules, days: november({ [WORKING[0]]: "late", [WORKING[1]]: "late" }) }));
    expect(item.breakdown.lateDaysDeducted).toBe(2);
    expect(item.deductions).toBe("2727.27");
  });

  it("leaves unpaid leave alone when the rules do not deduct it", () => {
    const rules: PayRules = { ...OFFICE_RULES, unpaidLeaveAsAbsent: false };
    const item = computePayroll(input({ rules, days: november({ [WORKING[0]]: "leave_unpaid" }) }));
    expect(item.unpaidLeaveDays).toBe(1);
    expect(item.deductions).toBe("0.00");
  });

  it("adds and deducts the four kinds of adjustment, several of each", () => {
    const item = computePayroll(
      input({
        adjustments: [
          { type: "bonus", amount: "1000" },
          { type: "bonus", amount: "250.50" },
          { type: "other_addition", amount: "100.00" },
          { type: "advance", amount: "2000.00" },
          { type: "other_deduction", amount: "75.25" },
        ],
      }),
    );
    expect(item.additions).toBe("1350.50");
    expect(item.deductions).toBe("2075.25");
    expect(item.breakdown.netBeforeRounding).toBe("29275.25");
    expect(item.net).toBe("29275.00");
    expect(item.breakdown.lines.map((l) => l.code)).toEqual(["salary", "advance", "other_deduction", "bonus", "other_addition"]);
  });

  it("rounds only the net, and rounds a half up", () => {
    // 1000.50 gross for a full month, nothing else: net before rounding is exactly 1000.50.
    const item = computePayroll(input({ salary: { gross: "1000.50", basicPct: "50" } }));
    expect(item.gross).toBe("1000.50");
    expect(item.breakdown.netBeforeRounding).toBe("1000.50");
    expect(item.net).toBe("1001.00");
    expect(computePayroll(input({ salary: { gross: "1000.49", basicPct: "50" } })).net).toBe("1000.00");
  });

  it("warns when net pay would be below zero", () => {
    const item = computePayroll(input({ adjustments: [{ type: "advance", amount: "31000" }] }));
    expect(item.net).toBe("-1000.00");
    expect(item.breakdown.warnings).toContain("Net pay is below zero. Check the deductions and advances before finalizing.");
  });

  it("deducts nothing and warns when a month has no working days", () => {
    const item = computePayroll(input({ workingDays: 0, days: november({ [WORKING[0]]: "absent" }) }));
    expect(item.absentDays).toBe(1);
    expect(item.deductions).toBe("0.00");
    expect(item.breakdown.warnings.some((w) => w.includes("no working days"))).toBe(true);
    // The same month priced by 30 still works.
    expect(computePayroll(input({ workingDays: 0, rules: { ...OFFICE_RULES, divisor: "thirty" }, days: november({ [WORKING[0]]: "absent" }) })).deductions).toBe("1000.00");
  });

  it("refuses rules that are missing their number", () => {
    expect(() => computePayroll(input({ rules: { ...OFFICE_RULES, lateEveryN: null } }))).toThrow(/how many lates/);
    expect(() => computePayroll(input({ rules: { ...OFFICE_RULES, lateMode: "fixed_per_late", lateEveryN: null, lateAmount: null } }))).toThrow(/amount/);
  });

  it("refuses an amount that is not money", () => {
    expect(() => computePayroll(input({ salary: { gross: "thirty thousand", basicPct: "50" } }))).toThrow();
    expect(() => computePayroll(input({ adjustments: [{ type: "bonus", amount: "-5" }] }))).toThrow();
  });

  it("does not change what it is given", () => {
    const original = input({ days: november({ [WORKING[0]]: "absent" }), adjustments: [{ type: "bonus", amount: "10" }] });
    const copy = structuredClone(original);
    computePayroll(original);
    expect(original).toEqual(copy);
  });
});
