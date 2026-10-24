import { describe, expect, it } from "vitest";

import {
  addDays,
  isWholeMonths,
  MAX_PERIOD_DAYS,
  monthPeriod,
  periodDays,
  periodLabel,
  periodMonths,
  periodQuery,
  presetPeriods,
  resolvePeriod,
  shiftPeriod,
  wholeMonthsIn,
} from "@/lib/period";

const TODAY = "2026-10-24";

describe("monthPeriod and the small helpers", () => {
  it("covers a whole month, leap years included", () => {
    expect(monthPeriod("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthPeriod("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthPeriod("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
  });

  it("counts days with both ends included", () => {
    expect(periodDays({ from: "2026-10-05", to: "2026-10-05" })).toBe(1);
    expect(periodDays(monthPeriod("2026-10"))).toBe(31);
    expect(periodDays({ from: "2026-12-30", to: "2027-01-02" })).toBe(4);
  });

  it("adds days across month and year ends and backwards", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("lists the months a period touches, even by one day", () => {
    expect(periodMonths({ from: "2026-08-15", to: "2026-10-02" })).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(periodMonths({ from: "2026-12-31", to: "2027-01-01" })).toEqual(["2026-12", "2027-01"]);
    expect(periodMonths({ from: "2026-10-05", to: "2026-10-09" })).toEqual(["2026-10"]);
  });

  it("knows whole months from part months", () => {
    expect(isWholeMonths({ from: "2026-08-01", to: "2026-10-31" })).toBe(true);
    expect(isWholeMonths({ from: "2026-08-02", to: "2026-10-31" })).toBe(false);
    expect(isWholeMonths({ from: "2026-08-01", to: "2026-10-30" })).toBe(false);
  });

  it("names only the months fully inside a period, the ones payroll can cover", () => {
    expect(wholeMonthsIn({ from: "2026-08-15", to: "2026-11-10" })).toEqual(["2026-09", "2026-10"]);
    expect(wholeMonthsIn({ from: "2026-10-05", to: "2026-10-20" })).toEqual([]);
    expect(wholeMonthsIn(monthPeriod("2026-10"))).toEqual(["2026-10"]);
  });
});

describe("presetPeriods", () => {
  const byKey = Object.fromEntries(presetPeriods(TODAY).map((p) => [p.key, p.period]));

  it("works out the quick choices from today", () => {
    expect(byKey.this_month).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(byKey.last_month).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(byKey.last_3_months).toEqual({ from: "2026-08-01", to: "2026-10-31" });
    expect(byKey.last_6_months).toEqual({ from: "2026-05-01", to: "2026-10-31" });
    expect(byKey.this_year).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(byKey.last_year).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("reaches back across the new year in the first months", () => {
    const early = Object.fromEntries(presetPeriods("2027-01-15").map((p) => [p.key, p.period]));
    expect(early.last_month).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(early.last_3_months).toEqual({ from: "2026-11-01", to: "2027-01-31" });
    expect(early.last_6_months).toEqual({ from: "2026-08-01", to: "2027-01-31" });
  });
});

describe("resolvePeriod", () => {
  it("uses this month when nothing is given", () => {
    expect(resolvePeriod({}, TODAY)).toEqual({ period: monthPeriod("2026-10"), preset: "this_month", notice: null });
  });

  it("still understands the old month parameter", () => {
    expect(resolvePeriod({ month: "2026-07" }, TODAY)).toEqual({ period: monthPeriod("2026-07"), preset: "custom", notice: null });
  });

  it("reads any from and to, and recognises a quick choice", () => {
    expect(resolvePeriod({ from: "2026-08-01", to: "2026-10-31" }, TODAY)).toEqual({
      period: { from: "2026-08-01", to: "2026-10-31" },
      preset: "last_3_months",
      notice: null,
    });
    expect(resolvePeriod({ from: "2026-10-05", to: "2026-10-12" }, TODAY).preset).toBe("custom");
  });

  it("prefers from and to over month", () => {
    expect(resolvePeriod({ month: "2026-01", from: "2026-10-05", to: "2026-10-12" }, TODAY).period).toEqual({ from: "2026-10-05", to: "2026-10-12" });
  });

  it("swaps dates that are the wrong way round and says so", () => {
    const result = resolvePeriod({ from: "2026-10-20", to: "2026-10-05" }, TODAY);
    expect(result.period).toEqual({ from: "2026-10-05", to: "2026-10-20" });
    expect(result.notice).toMatch(/swapped/);
  });

  it("fills in the other end when only one date is given", () => {
    expect(resolvePeriod({ from: "2026-10-12" }, TODAY).period).toEqual({ from: "2026-10-12", to: "2026-10-31" });
    expect(resolvePeriod({ to: "2026-10-12" }, TODAY).period).toEqual({ from: "2026-10-01", to: "2026-10-12" });
  });

  it("uses the one valid end when only one date makes sense", () => {
    expect(resolvePeriod({ from: "2026-02-30", to: "2026-03-01" }, TODAY).period).toEqual({ from: "2026-03-01", to: "2026-03-01" });
  });

  it("falls back to this month for nonsense", () => {
    for (const bad of [{ from: "yesterday", to: "tomorrow" }, { month: "2026-13" }, { from: "2026-02-30", to: "2026-02-31" }, { from: ["a"], to: 5 }]) {
      expect(resolvePeriod(bad as never, TODAY).period).toEqual(monthPeriod("2026-10"));
    }
  });

  it("cuts anything over a year to the first year and says so", () => {
    const result = resolvePeriod({ from: "2024-01-01", to: "2026-10-31" }, TODAY);
    expect(periodDays(result.period)).toBe(MAX_PERIOD_DAYS);
    expect(result.period.from).toBe("2024-01-01");
    expect(result.notice).toMatch(/more than a year/);
  });

  it("allows exactly a leap year but not a day more", () => {
    expect(resolvePeriod({ from: "2028-01-01", to: "2028-12-31" }, TODAY).notice).toBeNull();
    // 2026-01-01 to 2027-01-01 is 366 days and still fine, one day more is not.
    expect(resolvePeriod({ from: "2026-01-01", to: "2027-01-01" }, TODAY).notice).toBeNull();
    expect(resolvePeriod({ from: "2026-01-01", to: "2027-01-02" }, TODAY).notice).not.toBeNull();
  });
});

describe("shiftPeriod", () => {
  it("moves whole months by as many months as the period has", () => {
    expect(shiftPeriod({ from: "2026-08-01", to: "2026-10-31" }, -1)).toEqual({ from: "2026-05-01", to: "2026-07-31" });
    expect(shiftPeriod({ from: "2026-08-01", to: "2026-10-31" }, 1)).toEqual({ from: "2026-11-01", to: "2027-01-31" });
    expect(shiftPeriod(monthPeriod("2026-03"), -1)).toEqual(monthPeriod("2026-02"));
  });

  it("moves a part-month period by its own length in days", () => {
    expect(shiftPeriod({ from: "2026-10-05", to: "2026-10-11" }, 1)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(shiftPeriod({ from: "2026-10-05", to: "2026-10-11" }, -1)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });

  it("steps back and forward to where it started", () => {
    const p = { from: "2026-08-01", to: "2026-10-31" };
    expect(shiftPeriod(shiftPeriod(p, 1), -1)).toEqual(p);
    const q = { from: "2026-10-03", to: "2026-10-20" };
    expect(shiftPeriod(shiftPeriod(q, 1), -1)).toEqual(q);
  });
});

describe("periodLabel and periodQuery", () => {
  it("names whole months briefly", () => {
    expect(periodLabel(monthPeriod("2026-10"))).toBe("Oct 2026");
    expect(periodLabel({ from: "2026-08-01", to: "2026-10-31" })).toBe("Aug to Oct 2026");
    expect(periodLabel({ from: "2025-11-01", to: "2026-01-31" })).toBe("Nov 2025 to Jan 2026");
    expect(periodLabel({ from: "2026-01-01", to: "2026-12-31" })).toBe("Jan to Dec 2026");
  });

  it("names part months by their days", () => {
    expect(periodLabel({ from: "2026-10-05", to: "2026-10-05" })).toBe("5 Oct 2026");
    expect(periodLabel({ from: "2026-10-01", to: "2026-10-15" })).toBe("1 to 15 Oct 2026");
    expect(periodLabel({ from: "2026-09-28", to: "2026-10-05" })).toBe("28 Sep to 5 Oct 2026");
    expect(periodLabel({ from: "2026-12-28", to: "2027-01-05" })).toBe("28 Dec 2026 to 5 Jan 2027");
  });

  it("writes the query string", () => {
    expect(periodQuery({ from: "2026-08-01", to: "2026-10-31" })).toBe("from=2026-08-01&to=2026-10-31");
  });
});
