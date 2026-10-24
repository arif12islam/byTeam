import { describe, expect, it } from "vitest";

import { computeBalances, countedDaysInYear, type BalanceRequest } from "@/lib/leave/balances";

// 2026: Friday and Saturday are off.
const calendar = { weeklyOffDays: [5, 6], holidayDates: new Set<string>() };
const year2026 = { from: "2026-01-01", to: "2026-12-31" };
const base = { employees: [{ id: "e1", joinDate: "2020-01-01" }], types: [{ id: "casual", yearlyQuota: 10 }], calendar, basis: "calendar" as const, onDate: "2026-10-24" };

const req = (over: Partial<BalanceRequest>): BalanceRequest => ({
  employeeId: "e1",
  leaveTypeId: "casual",
  fromDate: "2026-10-04",
  toDate: "2026-10-06",
  unpaidDays: 0,
  status: "approved",
  ...over,
});

describe("countedDaysInYear", () => {
  it("counts working days only, so off days and holidays do not use up the quota", () => {
    // Thu 1 Oct to Mon 5 Oct: Thu, Sun, Mon (Fri and Sat are off)
    expect(countedDaysInYear({ fromDate: "2026-10-01", toDate: "2026-10-05", unpaidDays: 0 }, calendar, year2026)).toBe(3);
    const withHoliday = { weeklyOffDays: [5, 6], holidayDates: new Set(["2026-10-04"]) };
    expect(countedDaysInYear({ fromDate: "2026-10-01", toDate: "2026-10-05", unpaidDays: 0 }, withHoliday, year2026)).toBe(2);
  });

  it("leaves out the days recorded as unpaid", () => {
    expect(countedDaysInYear({ fromDate: "2026-10-04", toDate: "2026-10-08", unpaidDays: 2 }, calendar, year2026)).toBe(3);
    expect(countedDaysInYear({ fromDate: "2026-10-04", toDate: "2026-10-08", unpaidDays: 5 }, calendar, year2026)).toBe(0);
  });

  it("shares a request that runs across the new year between the two years", () => {
    // Wed 30 Dec 2026 to Sun 3 Jan 2027, Friday and Saturday off: Wed 30, Thu 31, Sun 3
    const request = { fromDate: "2026-12-30", toDate: "2027-01-03", unpaidDays: 0 };
    expect(countedDaysInYear(request, calendar, year2026)).toBe(2);
    expect(countedDaysInYear(request, calendar, { from: "2027-01-01", to: "2027-12-31" })).toBe(1);
  });

  it("takes the unpaid days from the end, so they can fall in the later year", () => {
    const request = { fromDate: "2026-12-30", toDate: "2027-01-03", unpaidDays: 1 };
    expect(countedDaysInYear(request, calendar, year2026)).toBe(2);
    expect(countedDaysInYear(request, calendar, { from: "2027-01-01", to: "2027-12-31" })).toBe(0);
  });
});

describe("computeBalances", () => {
  it("is the quota minus the approved days in the year", () => {
    const [b] = computeBalances({ ...base, requests: [req({}), req({ fromDate: "2026-11-01", toDate: "2026-11-01" })] });
    expect(b).toMatchObject({ employeeId: "e1", leaveTypeId: "casual", quota: 10, used: 4, pending: 0, remaining: 6, year: year2026 });
  });

  it("shows pending days separately and does not subtract them yet", () => {
    const [b] = computeBalances({ ...base, requests: [req({ status: "pending" })] });
    expect(b).toMatchObject({ used: 0, pending: 3, remaining: 10 });
  });

  it("ignores leave of another type, another person, and another year", () => {
    const [b] = computeBalances({
      ...base,
      requests: [
        req({ leaveTypeId: "other" }),
        req({ employeeId: "e2" }),
        req({ fromDate: "2025-10-04", toDate: "2025-10-06" }),
        req({ fromDate: "2027-10-03", toDate: "2027-10-04" }),
      ],
    });
    expect(b).toMatchObject({ used: 0, remaining: 10 });
  });

  it("has no limit and no remaining for a type without a quota", () => {
    const [b] = computeBalances({ ...base, types: [{ id: "casual", yearlyQuota: null }], requests: [req({})] });
    expect(b).toMatchObject({ quota: null, used: 3, remaining: null });
  });

  it("goes negative when a quota was lowered below what was already used", () => {
    const [b] = computeBalances({ ...base, types: [{ id: "casual", yearlyQuota: 2 }], requests: [req({})] });
    expect(b.remaining).toBe(-1);
  });

  it("gives every employee a row for every type, with a quota of zero meaning none left", () => {
    const rows = computeBalances({
      ...base,
      employees: [{ id: "e1", joinDate: "2020-01-01" }, { id: "e2", joinDate: "2020-01-01" }],
      types: [{ id: "casual", yearlyQuota: 10 }, { id: "sick", yearlyQuota: 0 }],
      requests: [],
    });
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.leaveTypeId === "sick")).toMatchObject({ quota: 0, remaining: 0 });
  });

  it("counts a year from each person's joining date when asked", () => {
    const joined = { id: "e1", joinDate: "2025-10-01" };
    // Joined on 1 Oct: today (24 Oct 2026) is in the year 1 Oct 2026 to 30 Sep 2027.
    const inYear = req({ fromDate: "2026-10-04", toDate: "2026-10-04" });
    const lastYear = req({ fromDate: "2026-09-27", toDate: "2026-09-27" }); // Sunday, before the new year began
    const [b] = computeBalances({ ...base, employees: [joined], basis: "anniversary", requests: [inYear, lastYear] });
    expect(b.year).toEqual({ from: "2026-10-01", to: "2027-09-30" });
    expect(b).toMatchObject({ used: 1, remaining: 9 });
    // Same leave under the calendar year counts both.
    expect(computeBalances({ ...base, employees: [joined], requests: [inYear, lastYear] })[0].used).toBe(2);
  });
});
