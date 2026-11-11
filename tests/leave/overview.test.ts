import { describe, expect, it } from "vitest";

import { groupLeaveRequests, leaveHeroCounts } from "@/lib/leave/overview";
import { matchesPerson } from "@/lib/people-filter";

const req = (status: "pending" | "approved" | "rejected" | "cancelled", fromDate: string, toDate = fromDate) => ({ status, fromDate, toDate });
const today = "2026-10-10";

describe("leaveHeroCounts", () => {
  it("counts waiting, on leave today and coming up", () => {
    const counts = leaveHeroCounts(
      [
        req("pending", "2026-10-20"),
        req("pending", "2026-09-01"),
        req("approved", "2026-10-09", "2026-10-11"),
        req("approved", "2026-10-10"),
        req("approved", "2026-10-11"),
        req("approved", "2026-10-24"),
        req("approved", "2026-10-25"),
        req("approved", "2026-10-01", "2026-10-09"),
        req("rejected", "2026-10-10"),
        req("cancelled", "2026-10-12"),
      ],
      today,
    );
    expect(counts).toEqual({ waiting: 2, onLeaveToday: 2, comingUp: 2 });
  });

  it("is all zero with no requests", () => {
    expect(leaveHeroCounts([], today)).toEqual({ waiting: 0, onLeaveToday: 0, comingUp: 0 });
  });

  it("counts a request starting 14 days ahead across a month end", () => {
    expect(leaveHeroCounts([req("approved", "2026-11-01")], "2026-10-18").comingUp).toBe(1);
    expect(leaveHeroCounts([req("approved", "2026-11-02")], "2026-10-18").comingUp).toBe(0);
  });
});

describe("groupLeaveRequests", () => {
  it("sorts requests into waiting, upcoming and past", () => {
    const rows = [
      { id: "a", ...req("pending", "2026-10-30") },
      { id: "b", ...req("approved", "2026-10-30") },
      { id: "c", ...req("approved", "2026-10-12") },
      { id: "d", ...req("approved", "2026-10-01", "2026-10-05") },
      { id: "e", ...req("approved", "2026-08-01") },
      { id: "f", ...req("rejected", "2026-10-12") },
      { id: "g", ...req("cancelled", "2026-10-02") },
      { id: "h", ...req("approved", "2026-10-08", "2026-10-10") },
    ];
    const groups = groupLeaveRequests(rows, today);
    expect(groups.waiting.map((r) => r.id)).toEqual(["a"]);
    // On now or ahead, soonest first, then recently ended.
    expect(groups.upcoming.map((r) => r.id)).toEqual(["h", "c", "b", "d"]);
    expect(groups.past.map((r) => r.id)).toEqual(["e", "f", "g"]);
  });
});

describe("matchesPerson", () => {
  const person = { name: "Rahim Uddin", department: "Sales" };
  it("matches everyone when nothing is chosen", () => {
    expect(matchesPerson(person, "", "")).toBe(true);
  });
  it("searches the name without case", () => {
    expect(matchesPerson(person, " rahi", "")).toBe(true);
    expect(matchesPerson(person, "karim", "")).toBe(false);
  });
  it("filters by department", () => {
    expect(matchesPerson(person, "", "Sales")).toBe(true);
    expect(matchesPerson(person, "", "Ops")).toBe(false);
    expect(matchesPerson({ name: "A", department: null }, "", "Sales")).toBe(false);
  });
});
