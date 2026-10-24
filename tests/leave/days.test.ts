import { describe, expect, it } from "vitest";

import { leaveWorkingDates, splitUnpaid } from "@/lib/leave/days";

// October 2026: Thursday 1st, Friday 2nd, Saturday 3rd, Sunday 4th.
const calendar = { weeklyOffDays: [5, 6], holidayDates: new Set<string>() };

describe("leaveWorkingDates", () => {
  it("lists every working day from the first date to the last, both included", () => {
    expect(leaveWorkingDates("2026-10-04", "2026-10-06", calendar)).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"]);
    expect(leaveWorkingDates("2026-10-05", "2026-10-05", calendar)).toEqual(["2026-10-05"]);
  });

  it("skips weekly off days", () => {
    expect(leaveWorkingDates("2026-10-01", "2026-10-05", calendar)).toEqual(["2026-10-01", "2026-10-04", "2026-10-05"]);
  });

  it("skips holidays, even on a working weekday", () => {
    const withHoliday = { weeklyOffDays: [5, 6], holidayDates: new Set(["2026-10-05"]) };
    expect(leaveWorkingDates("2026-10-04", "2026-10-06", withHoliday)).toEqual(["2026-10-04", "2026-10-06"]);
  });

  it("counts a holiday that falls on a weekly off day once, as a day off", () => {
    const both = { weeklyOffDays: [5, 6], holidayDates: new Set(["2026-10-02"]) };
    expect(leaveWorkingDates("2026-10-01", "2026-10-04", both)).toEqual(["2026-10-01", "2026-10-04"]);
  });

  it("has no days when the request is only days off", () => {
    expect(leaveWorkingDates("2026-10-02", "2026-10-03", calendar)).toEqual([]);
  });

  it("counts every day when no weekly off days are set", () => {
    expect(leaveWorkingDates("2026-10-01", "2026-10-04", { weeklyOffDays: [], holidayDates: new Set() })).toHaveLength(4);
  });

  it("works across a month end and a leap day", () => {
    expect(leaveWorkingDates("2028-02-28", "2028-03-01", { weeklyOffDays: [], holidayDates: new Set() })).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("is empty when the dates are the wrong way round", () => {
    expect(leaveWorkingDates("2026-10-06", "2026-10-04", calendar)).toEqual([]);
  });
});

describe("splitUnpaid", () => {
  const days = ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"];

  it("makes the last days the unpaid ones", () => {
    expect(splitUnpaid(days, 1)).toEqual({ paid: days.slice(0, 3), unpaid: ["2026-10-07"] });
    expect(splitUnpaid(days, 3)).toEqual({ paid: ["2026-10-04"], unpaid: days.slice(1) });
  });

  it("is all paid for none, and all unpaid for every day", () => {
    expect(splitUnpaid(days, 0)).toEqual({ paid: days, unpaid: [] });
    expect(splitUnpaid(days, 4)).toEqual({ paid: [], unpaid: days });
  });

  it("never goes past the days there are, or below zero", () => {
    expect(splitUnpaid(days, 9).unpaid).toEqual(days);
    expect(splitUnpaid(days, -2).unpaid).toEqual([]);
    expect(splitUnpaid([], 2)).toEqual({ paid: [], unpaid: [] });
  });
});
