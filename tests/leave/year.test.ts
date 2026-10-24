import { describe, expect, it } from "vitest";

import { anniversary, leaveYearOf, leaveYearsBetween, nextLeaveYear } from "@/lib/leave/year";

describe("leaveYearOf with the calendar basis", () => {
  it("is 1 January to 31 December of the date's year, whatever the joining date", () => {
    expect(leaveYearOf("calendar", "2020-06-15", "2026-10-24")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(leaveYearOf("calendar", "2026-06-15", "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(leaveYearOf("calendar", "2020-06-15", "2026-12-31")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("leaveYearOf with the anniversary basis", () => {
  const join = "2024-03-15";

  it("starts the first year on the joining date and ends the day before the first anniversary", () => {
    expect(leaveYearOf("anniversary", join, "2024-03-15")).toEqual({ from: "2024-03-15", to: "2025-03-14" });
    expect(leaveYearOf("anniversary", join, "2025-03-14")).toEqual({ from: "2024-03-15", to: "2025-03-14" });
  });

  it("rolls over on the anniversary itself", () => {
    expect(leaveYearOf("anniversary", join, "2025-03-15")).toEqual({ from: "2025-03-15", to: "2026-03-14" });
    expect(leaveYearOf("anniversary", join, "2026-10-24")).toEqual({ from: "2026-03-15", to: "2027-03-14" });
  });

  it("handles a date earlier in the calendar year than the anniversary", () => {
    expect(leaveYearOf("anniversary", join, "2026-01-10")).toEqual({ from: "2025-03-15", to: "2026-03-14" });
  });

  it("gives the first year to a date before the joining date", () => {
    expect(leaveYearOf("anniversary", join, "2023-12-01")).toEqual({ from: "2024-03-15", to: "2025-03-14" });
  });

  it("handles someone who joined on 1 January", () => {
    expect(leaveYearOf("anniversary", "2025-01-01", "2026-06-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("moves a 29 February anniversary to 28 February in other years", () => {
    expect(anniversary("2024-02-29", 0)).toBe("2024-02-29");
    expect(anniversary("2024-02-29", 1)).toBe("2025-02-28");
    expect(anniversary("2024-02-29", 4)).toBe("2028-02-29");
    expect(leaveYearOf("anniversary", "2024-02-29", "2025-03-01")).toEqual({ from: "2025-02-28", to: "2026-02-27" });
    expect(leaveYearOf("anniversary", "2024-02-29", "2027-06-01")).toEqual({ from: "2027-02-28", to: "2028-02-28" });
  });
});

describe("nextLeaveYear and leaveYearsBetween", () => {
  it("steps from one year to the next without gaps or overlaps", () => {
    const first = leaveYearOf("anniversary", "2024-03-15", "2024-04-01");
    const second = nextLeaveYear("anniversary", "2024-03-15", first);
    expect(second).toEqual({ from: "2025-03-15", to: "2026-03-14" });
    expect(nextLeaveYear("calendar", "2024-03-15", { from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2027-01-01", to: "2027-12-31" });
  });

  it("lists every leave year a range touches", () => {
    expect(leaveYearsBetween("calendar", "2020-01-01", "2026-12-30", "2027-01-03")).toEqual([
      { from: "2026-01-01", to: "2026-12-31" },
      { from: "2027-01-01", to: "2027-12-31" },
    ]);
    expect(leaveYearsBetween("calendar", "2020-01-01", "2026-03-01", "2026-03-05")).toHaveLength(1);
    expect(leaveYearsBetween("anniversary", "2024-03-15", "2026-03-10", "2026-03-20")).toEqual([
      { from: "2025-03-15", to: "2026-03-14" },
      { from: "2026-03-15", to: "2027-03-14" },
    ]);
  });

  it("includes a range that ends exactly on the last day of a year in that year only", () => {
    expect(leaveYearsBetween("calendar", "2020-01-01", "2026-12-30", "2026-12-31")).toHaveLength(1);
  });
});
