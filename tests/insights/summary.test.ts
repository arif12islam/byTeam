import { describe, expect, it } from "vitest";

import type { GridInput } from "@/lib/attendance/month";
import { withoutPeople } from "@/lib/insights/facts";
import {
  buildSummary,
  dailyPoints,
  deltaText,
  departments,
  deviceHealth,
  gridBeforeToday,
  headline,
  latesByWeekday,
  leaveLow,
  payrollTrend,
  people,
} from "@/lib/insights/summary";
import { officeDateTimeToInstant } from "@/lib/time";

import { absent, input, late, NOW, person, TODAY } from "./fixtures";

// TODAY is Thursday 12 Nov 2026: 1 and 8 Nov are Sundays, 7 Nov a Saturday. October 2026 starts on a Thursday.
const leave = { status: "leave_paid" as const, punchCount: 0 };
const off = { status: "weekly_off" as const, punchCount: 0 };
const mine = (days: Record<number, object>, last = 12) => [person("a", "Rahim", "2026-11", days, last)];
const inDepartment = (p: GridInput, department: string): GridInput => ({ ...p, employee: { ...p.employee, department } });

describe("gridBeforeToday", () => {
  it("drops only today's absence and works the totals out again", () => {
    const grid = gridBeforeToday(input({ current: mine({ 11: absent, 12: absent }) }).current, TODAY);
    const row = grid.rows[0];
    expect(row.cells.has("2026-11-12")).toBe(false);
    expect(row.cells.get("2026-11-11")?.status).toBe("absent");
    expect(row.totals.absent).toBe(1);
  });

  it("keeps today when the person came in", () => {
    const grid = gridBeforeToday(input({ current: mine({ 12: late }) }).current, TODAY);
    expect(grid.rows[0].cells.get("2026-11-12")?.status).toBe("late");
  });
});

describe("headline", () => {
  it("counts the month so far against the same days last month, and never counts today as absent", () => {
    const h = headline(
      input({
        current: mine({ 3: late, 5: late, 11: absent, 12: absent }),
        previous: [person("a", "Rahim", "2026-10", { 1: late, 2: late, 3: late, 20: late, 4: absent, 25: absent }, 31)],
      }),
    );
    expect(h.lates).toBe(2);
    expect(h.latesPrev).toBe(3);
    expect(h.absences).toBe(1);
    expect(h.absencesPrev).toBe(1);
    // Eleven days count (today's absence does not): 10 attended, 2 of them late, and 1 absent.
    expect(h.rate).toBeCloseTo(10 / 11);
    expect(h.compare).toBe(true);
  });

  it("does not compare early in the month", () => {
    expect(headline(input({ today: "2026-11-02", current: mine({}, 1) })).compare).toBe(false);
  });

  it("says who is in today, and whether it is a day off or has no records", () => {
    const people4: GridInput[] = [
      person("a", "A", "2026-11", {}, 12),
      person("b", "B", "2026-11", { 12: late }, 12),
      person("c", "C", "2026-11", { 12: absent }, 12),
      person("d", "D", "2026-11", { 12: leave }, 12),
    ];
    expect(headline(input({ current: people4 })).today).toEqual({ kind: "open", inOffice: 2, due: 3, onLeave: 1 });
    expect(headline(input({ current: [person("a", "A", "2026-11", { 12: off }, 12)] })).today.kind).toBe("day-off");
    expect(headline(input({ current: mine({}, 11) })).today.kind).toBe("no-records");
  });

  it("has no rate before any working day", () => {
    expect(headline(input()).rate).toBeNull();
  });
});

describe("deltaText", () => {
  it("writes the difference in words, or nothing when it is not worth saying", () => {
    expect(deltaText(5, 3, true)).toBe("2 more than at this point last month");
    expect(deltaText(1, 4, true)).toBe("3 fewer than at this point last month");
    expect(deltaText(2, 2, true)).toBe("The same as at this point last month");
    expect(deltaText(5, 3, false)).toBeNull();
  });
});

describe("dailyPoints", () => {
  it("leaves out today's absence, so a day with only that is not shown as a day yet", () => {
    const points = dailyPoints(input({ current: mine({ 11: absent, 12: absent }) }));
    expect(points.find((p) => p.date === "2026-11-11")).toMatchObject({ kind: "working", absent: 1 });
    expect(points.find((p) => p.date === "2026-11-12")).toMatchObject({ kind: "future", absent: 0 });
  });
});

describe("latesByWeekday", () => {
  it("counts this month and last, and skips a weekday that was always off", () => {
    const current = mine({ 2: late, 9: late, 7: off });
    const previous = [person("a", "Rahim", "2026-10", { 5: late }, 31)];
    const rows = latesByWeekday(input({ current, previous }));
    expect(rows.find((r) => r.label === "Mon")?.lates).toBe(3);
    expect(rows.map((r) => r.label)).toContain("Sun");
  });

  it("is empty when nobody was late", () => {
    expect(latesByWeekday(input({ current: mine({}) }))).toEqual([]);
  });
});

describe("people", () => {
  const current = [
    person("a", "Ayesha", "2026-11", {}, 12),
    person("b", "Babul", "2026-11", { 3: late, 4: late, 5: absent }, 12),
    person("c", "Chitra", "2026-11", { 12: absent }, 12),
    person("d", "Dilip", "2026-11", { 2: late }, 12),
  ];

  it("lists who was on time every day, and who has the most lates and absences", () => {
    const { onTime, needsLook } = people(input({ current }));
    expect(onTime.map((p) => p.name)).toEqual(["Ayesha", "Chitra"]);
    expect(needsLook.map((p) => p.name)).toEqual(["Babul", "Dilip"]);
    expect(needsLook[0]).toMatchObject({ late: 2, absent: 1, href: "/attendance/b?month=2026-11" });
  });

  it("does not list someone whose only absence is today", () => {
    expect(people(input({ current })).needsLook.map((p) => p.name)).not.toContain("Chitra");
  });

  it("needs five on-time days before someone is listed", () => {
    expect(people(input({ current: [person("a", "A", "2026-11", {}, 5)] })).onTime).toHaveLength(1);
    expect(people(input({ current: [person("a", "A", "2026-11", {}, 4)] })).onTime).toHaveLength(0);
  });
});

describe("leaveLow", () => {
  const balance = (id: string, quota: number | null, remaining: number | null) => ({ employeeId: id, quota, remaining, employeeName: id, leaveTypeName: "Casual" });

  it("shows a balance at 2 days or under, or under 15% of the year, and nothing for no limit", () => {
    const rows = leaveLow(
      input({ balances: [balance("a", 14, 2), balance("b", 14, 3), balance("c", 5, 1), balance("d", null, null), balance("e", 100, 5), balance("f", 14, 0)] }),
    );
    // The lowest share of the year first.
    expect(rows.map((r) => r.employeeId)).toEqual(["f", "e", "a", "c"]);
    expect(rows[0]).toMatchObject({ employeeId: "f", remaining: 0 });
  });
});

describe("deviceHealth", () => {
  const device = (name: string, minutesAgo: number | null, drift: number | null, active = true) => ({
    id: name,
    serialNo: name,
    name,
    lastSeenAt: minutesAgo === null ? null : new Date(NOW.getTime() - minutesAgo * 60_000),
    clockOffsetSeconds: drift,
    clockCheckedAt: null,
    active,
  });

  it("gives each active device its status and clock, and counts recent unlinked codes", () => {
    const health = deviceHealth(
      input({
        devices: [device("Door", 2, 5), device("Back", 300, 300), device("Never", null, null), device("Off", 1, 0, false)],
        unmatched: [
          { empCode: "1", punches: 2, firstPunchAt: NOW, lastPunchAt: officeDateTimeToInstant("2026-11-10", "09:00")!, devices: [] },
          { empCode: "2", punches: 2, firstPunchAt: NOW, lastPunchAt: officeDateTimeToInstant("2026-10-01", "09:00")!, devices: [] },
        ],
      }),
    );
    expect(health.devices.map((d) => [d.name, d.status])).toEqual([["Door", "online"], ["Back", "offline"], ["Never", "never"]]);
    expect(health.devices[1].driftSeconds).toBe(300);
    expect(health.unknownCodes).toBe(1);
  });
});

describe("departments", () => {
  it("is null with fewer than two real departments", () => {
    expect(departments(input({ current: mine({}) }))).toBeNull();
    expect(departments(input({ current: [inDepartment(person("a", "A", "2026-11", {}, 12), "Sales"), person("b", "B", "2026-11", {}, 12)] }))).toBeNull();
  });

  it("compares two or more", () => {
    const rows = departments(input({ current: [inDepartment(person("a", "A", "2026-11", {}, 12), "Sales"), inDepartment(person("b", "B", "2026-11", { 3: absent }, 12), "Ops")] }));
    expect(rows?.map((r) => r.department).sort()).toEqual(["Ops", "Sales"]);
  });
});

describe("payrollTrend", () => {
  it("is empty with fewer than two runs", () => {
    expect(payrollTrend(input({ payroll: [{ month: "2026-10", net: 100, people: 2 }] }))).toEqual({ months: [], changePercent: null });
  });

  it("lists the latest runs oldest first and the change in the newest", () => {
    const trend = payrollTrend(
      input({
        payroll: [
          { month: "2026-10", net: 110_000, people: 3 },
          { month: "2026-09", net: 100_000, people: 3 },
          { month: "2026-08", net: 90_000, people: 3 },
          { month: "2026-07", net: 80_000, people: 3 },
        ],
      }),
    );
    expect(trend.months.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(trend.changePercent).toBeCloseTo(10);
  });
});

describe("buildSummary", () => {
  it("leaves out people who are left out of Insights", () => {
    const base = input({ current: [person("a", "Ayesha", "2026-11", {}, 12), person("b", "Babul", "2026-11", { 3: late, 4: late }, 12)] });
    expect(buildSummary(base).people.needsLook.map((p) => p.name)).toEqual(["Babul"]);
    const summary = buildSummary(withoutPeople(base, new Set(["b"])));
    expect(summary.people.needsLook).toEqual([]);
    expect(summary.month).toBe("2026-11");
  });
});
