import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import { buildPeriodGrid, type GridInput } from "@/lib/attendance/month";
import type { DeviceRow } from "@/lib/devices/devices";
import {
  buildInsights,
  deviceFacts,
  forgotToPunchOut,
  latesTrend,
  latesUp,
  lowLeaveBalance,
  nearLateDeduction,
  payrollChange,
  perfectAttendance,
  rankFacts,
  topFacts,
  unmatchedCodes,
  worstWeekday,
  type Fact,
  type InsightsInput,
} from "@/lib/insights/facts";
import { monthPeriod } from "@/lib/period";
import { officeDateTimeToInstant } from "@/lib/time";

const TODAY = "2026-11-12"; // a Thursday
const NOW = officeDateTimeToInstant(TODAY, "12:00")!;

const result = (over: Partial<DayResult> = {}): DayResult => ({
  status: "present",
  firstIn: null,
  lastOut: null,
  lateMinutes: 0,
  earlyMinutes: 0,
  missingOut: false,
  workedOnOffDay: false,
  punchCount: 2,
  isManual: false,
  ...over,
});

const day = (month: string, d: number) => `${month}-${String(d).padStart(2, "0")}`;

/** A person's month: `days` is a status for each date from the 1st, and anything not listed is a plain present day up to `last`. */
function person(id: string, name: string, month: string, days: Record<number, Partial<DayResult>>, last: number): GridInput {
  const out: GridInput["days"] = [];
  for (let d = 1; d <= last; d += 1) out.push({ date: day(month, d), result: result(days[d] ?? {}) });
  return { employee: { id, empCode: id, name, department: null }, days: out };
}

const late = { status: "late" as const, lateMinutes: 20 };
const absent = { status: "absent" as const, punchCount: 0 };
const lates = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, late]));

function input(over: Omit<Partial<InsightsInput>, "current" | "previous"> & { current?: GridInput[]; previous?: GridInput[] } = {}): InsightsInput {
  const { current = [], previous = [], ...rest } = over;
  return {
    today: TODAY,
    now: NOW,
    current: buildPeriodGrid(monthPeriod("2026-11"), current),
    previous: buildPeriodGrid(monthPeriod("2026-10"), previous),
    trackLeavingPunch: true,
    lateRule: { lateMode: "days_per_lates", lateEveryN: 3 },
    balances: [],
    devices: [],
    officeOpen: true,
    unmatched: [],
    payroll: [],
    ...rest,
  };
}

const ids = (facts: Fact[]) => facts.map((f) => f.id);

describe("latesUp", () => {
  it("names someone who is 3 or more lates worse than the same days last month", () => {
    const facts = latesUp(
      input({
        current: [person("a", "Rahim", "2026-11", lates(6), 12), person("b", "Karim", "2026-11", lates(4), 12)],
        previous: [person("a", "Rahim", "2026-10", lates(2), 31), person("b", "Karim", "2026-10", lates(2), 31)],
      }),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ id: "lates-up:a", tone: "warning", category: "people", href: "/employees/a" });
    expect(facts[0].text).toBe("Rahim was late 6 times so far this month, up from 2 at this point last month.");
  });

  it("only counts last month's lates up to the same day of the month", () => {
    const lateLastMonthAfterThe12th = Object.fromEntries([20, 21, 22, 23, 24].map((d) => [d, late]));
    expect(latesUp(input({ current: [person("a", "Rahim", "2026-11", lates(4), 12)], previous: [person("a", "Rahim", "2026-10", lateLastMonthAfterThe12th, 31)] }))).toHaveLength(1);
  });

  it("treats someone with no history as having had none, and lists the worst first, at most five", () => {
    const current = Array.from({ length: 7 }, (_, i) => person(`p${i}`, `Person ${i}`, "2026-11", lates(3 + i), 12));
    const facts = latesUp(input({ current }));
    expect(facts).toHaveLength(5);
    expect(ids(facts)[0]).toBe("lates-up:p6");
  });
});

describe("nearLateDeduction", () => {
  it("names someone one late away from a day of pay, by the rule in force", () => {
    const current = [person("a", "Rahim", "2026-11", lates(2), 12), person("b", "Karim", "2026-11", lates(3), 12), person("c", "Sima", "2026-11", lates(5), 12), person("d", "Anwar", "2026-11", lates(1), 12)];
    const facts = nearLateDeduction(input({ current }));
    expect(ids(facts).sort()).toEqual(["near-deduction:a", "near-deduction:c"]);
    expect(facts.find((f) => f.id === "near-deduction:a")?.text).toBe("Rahim has 2 lates this month. One more costs a day of pay.");
  });

  it("says nothing for rules that do not work that way, or when there is no rule", () => {
    const current = [person("a", "Rahim", "2026-11", lates(2), 12)];
    expect(nearLateDeduction(input({ current, lateRule: { lateMode: "fixed_per_late", lateEveryN: null } }))).toEqual([]);
    expect(nearLateDeduction(input({ current, lateRule: { lateMode: "none", lateEveryN: null } }))).toEqual([]);
    expect(nearLateDeduction(input({ current, lateRule: { lateMode: "days_per_lates", lateEveryN: 1 } }))).toEqual([]);
    expect(nearLateDeduction(input({ current, lateRule: null }))).toEqual([]);
  });
});

describe("forgotToPunchOut", () => {
  const forgot = (days: number[]) => Object.fromEntries(days.map((d) => [d, { missingOut: true }]));

  it("names someone with 3 or more days without a leaving punch, not counting today", () => {
    const facts = forgotToPunchOut(input({ current: [person("a", "Sharif", "2026-11", forgot([2, 3, 4, 12]), 12), person("b", "Bela", "2026-11", forgot([2, 12]), 12), person("c", "Chand", "2026-11", forgot([3, 4, 5]), 12)] }));
    expect(ids(facts).sort()).toEqual(["forgot-out:a", "forgot-out:c"]);
    expect(facts.find((f) => f.id === "forgot-out:a")?.text).toBe("Sharif has no leaving punch on 3 days this month.");
  });

  it("is silent when the office does not use the leaving punch", () => {
    expect(forgotToPunchOut(input({ trackLeavingPunch: false, current: [person("a", "Sharif", "2026-11", forgot([2, 3, 4, 5]), 12)] }))).toEqual([]);
  });
});

describe("perfectAttendance", () => {
  const clean = (name: string, id: string) => [person(id, name, "2026-11", {}, 12), person(id, name, "2026-10", {}, 31)] as const;

  it("groups people on time every working day for two months into one fact", () => {
    const [n1, o1] = clean("Nasrin", "a");
    const [n2, o2] = clean("Tania", "b");
    const [n3, o3] = clean("Umar", "c");
    const [n4, o4] = clean("Vera", "d");
    const facts = perfectAttendance(input({ current: [n1, n2, n3, n4], previous: [o1, o2, o3, o4] }));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ tone: "success", id: "perfect-attendance" });
    expect(facts[0].text).toBe("Nasrin, Tania, Umar and 1 more were on time every working day for two months.");
  });

  it("says was for one person, and needs a clean record in both months and enough days", () => {
    const [n1, o1] = clean("Nasrin", "a");
    expect(perfectAttendance(input({ current: [n1], previous: [o1] }))[0].text).toBe("Nasrin was on time every working day for two months.");

    expect(perfectAttendance(input({ current: [person("a", "Nasrin", "2026-11", lates(1), 12)], previous: [o1] }))).toEqual([]);
    expect(perfectAttendance(input({ current: [n1], previous: [person("a", "Nasrin", "2026-10", { 5: absent }, 31)] }))).toEqual([]);
    expect(perfectAttendance(input({ current: [n1], previous: [person("a", "Nasrin", "2026-10", {}, 8)] }))).toEqual([]);
    expect(perfectAttendance(input({ current: [n1], previous: [] }))).toEqual([]);
  });
});

describe("worstWeekday", () => {
  // 1 Nov 2026 is a Sunday; 4 Nov a Wednesday.
  it("calls out a weekday that has a large share of the month's absences", () => {
    const current = [person("a", "A", "2026-11", { 1: absent, 8: absent }, 12), person("b", "B", "2026-11", { 1: absent, 4: absent }, 12), person("c", "C", "2026-11", { 8: absent }, 12)];
    const facts = worstWeekday(input({ current }));
    expect(facts).toHaveLength(1);
    expect(facts[0].text).toBe("Sundays have the most absences this month: 4 of 5.");
  });

  it("says nothing with few absences or when they are spread out", () => {
    expect(worstWeekday(input({ current: [person("a", "A", "2026-11", { 1: absent, 4: absent, 5: absent }, 12)] }))).toEqual([]);
    expect(worstWeekday(input({ current: [person("a", "A", "2026-11", { 1: absent, 2: absent, 3: absent, 4: absent, 5: absent }, 12)] }))).toEqual([]);
  });
});

describe("latesTrend", () => {
  const people = (now: number, then: number) => ({ current: [person("a", "A", "2026-11", lates(now), 12)], previous: [person("a", "A", "2026-10", lates(then), 31)] });

  it("says when lates are up or down against the same days last month", () => {
    expect(latesTrend(input(people(12, 7)))[0]).toMatchObject({ tone: "warning", text: "Lates are up: 12 so far this month, against 7 at this point last month." });
    expect(latesTrend(input(people(3, 10)))[0]).toMatchObject({ tone: "success", text: "Lates are down: 3 so far this month, against 10 at this point last month." });
  });

  it("says nothing for a small change, a small number, or early in the month", () => {
    expect(latesTrend(input(people(8, 7)))).toEqual([]);
    expect(latesTrend(input(people(4, 1)))).toEqual([]);
    expect(latesTrend(input({ ...people(12, 7), today: "2026-11-05" }))).toEqual([]);
  });
});

describe("lowLeaveBalance", () => {
  const balance = (remaining: number | null, quota: number | null = 10) => ({ employeeId: "a", employeeName: "Tania", leaveTypeName: "Annual leave", quota, remaining });

  it("names someone with a day or none left of a limited leave type", () => {
    expect(lowLeaveBalance(input({ balances: [balance(1)] }))[0].text).toBe("Tania has 1 day of Annual leave left this year.");
    expect(lowLeaveBalance(input({ balances: [balance(0)] }))[0].text).toBe("Tania has no days of Annual leave left this year.");
  });

  it("ignores plenty left, no limit, and a negative balance", () => {
    expect(lowLeaveBalance(input({ balances: [balance(2), balance(null, null), balance(-1)] }))).toEqual([]);
  });
});

describe("deviceFacts", () => {
  const device = (over: Partial<DeviceRow> = {}): DeviceRow =>
    ({ id: "d", serialNo: "SN1", name: "Front door", lastSeenAt: new Date(NOW.getTime() - 2 * 3_600_000), clockOffsetSeconds: null, clockCheckedAt: null, active: true, ...over }) as DeviceRow;

  it("flags a device that has gone quiet while the office is open, and not otherwise", () => {
    const [fact] = deviceFacts(input({ devices: [device()] }));
    expect(fact).toMatchObject({ tone: "danger", category: "office", href: "/devices" });
    expect(fact.text).toContain("Front door was last heard from 2 h ago");
    expect(deviceFacts(input({ devices: [device()], officeOpen: false }))).toEqual([]);
    expect(deviceFacts(input({ devices: [device({ lastSeenAt: new Date(NOW.getTime() - 60_000) })] }))).toEqual([]);
  });

  it("flags a clock that is minutes out, fast or slow", () => {
    const fast = deviceFacts(input({ devices: [device({ lastSeenAt: NOW, clockOffsetSeconds: 300 })] }))[0];
    expect(fast.text).toBe("Front door's clock is 5 min fast, so punch times may be off.");
    expect(deviceFacts(input({ devices: [device({ lastSeenAt: NOW, clockOffsetSeconds: -180 })] }))[0].text).toContain("3 min slow");
    expect(deviceFacts(input({ devices: [device({ lastSeenAt: NOW, clockOffsetSeconds: 30 })] }))).toEqual([]);
  });

  it("ignores a switched off device", () => {
    expect(deviceFacts(input({ devices: [device({ active: false })] }))).toEqual([]);
  });
});

describe("unmatchedCodes", () => {
  const code = (empCode: string, daysAgo: number, punches = 5) => ({
    empCode,
    punches,
    firstPunchAt: new Date(NOW.getTime() - (daysAgo + 1) * 86_400_000),
    lastPunchAt: new Date(NOW.getTime() - daysAgo * 86_400_000 + 1_000),
    devices: ["SN1"],
  });

  it("names a code that punched recently but belongs to nobody, with a link to add them", () => {
    const [fact] = unmatchedCodes(input({ unmatched: [code("23", 0)] }));
    expect(fact).toMatchObject({ tone: "warning", href: "/employees/new?code=23" });
    expect(fact.text).toBe("Code 23 punched 5 times but is not linked to anyone, today.");
    expect(unmatchedCodes(input({ unmatched: [code("24", 3, 1)] }))[0].text).toBe("Code 24 punched 1 time but is not linked to anyone.");
  });

  it("leaves out a code that has not punched for two weeks", () => {
    expect(unmatchedCodes(input({ unmatched: [code("25", 20)] }))).toEqual([]);
  });
});

describe("payrollChange", () => {
  it("says how net pay moved between the two latest months, and the change in people", () => {
    const [fact] = payrollChange(input({ payroll: [{ month: "2026-10", net: 612_000, people: 20 }, { month: "2026-09", net: 588_000, people: 18 }] }));
    expect(fact).toMatchObject({ category: "payroll", tone: "info", href: "/payroll" });
    expect(fact.text).toBe("Net pay for Oct 2026 was 4% higher than Sept 2026, with 2 more people paid.");
    expect(payrollChange(input({ payroll: [{ month: "2026-10", net: 500_000, people: 17 }, { month: "2026-09", net: 600_000, people: 18 }] }))[0].text).toBe(
      "Net pay for Oct 2026 was 17% lower than Sept 2026, with 1 fewer person paid.",
    );
  });

  it("says nothing for a small change or without two months", () => {
    expect(payrollChange(input({ payroll: [{ month: "2026-10", net: 601_000, people: 18 }, { month: "2026-09", net: 600_000, people: 18 }] }))).toEqual([]);
    expect(payrollChange(input({ payroll: [{ month: "2026-10", net: 600_000, people: 18 }] }))).toEqual([]);
    expect(payrollChange(input({ payroll: [] }))).toEqual([]);
  });
});

describe("ranking and the whole set", () => {
  const fact = (id: string, tone: Fact["tone"], weight: number, category: Fact["category"] = "people"): Fact => ({ id, tone, weight, category, text: id, href: null });

  it("puts problems before notes before good news, then the bigger first", () => {
    const ranked = rankFacts([fact("good", "success", 9), fact("note", "info", 1), fact("warn-small", "warning", 1), fact("danger", "danger", 1), fact("warn-big", "warning", 5)]);
    expect(ids(ranked)).toEqual(["danger", "warn-big", "warn-small", "note", "good"]);
  });

  it("shows good news on Today only when there is nothing to look at", () => {
    const both = buildInsights(input({ current: [person("a", "Rahim", "2026-11", lates(2), 12)], previous: [] }));
    expect(topFacts(both).every((f) => f.tone !== "success")).toBe(true);

    const onlyGood = { facts: [fact("good", "success", 1)], byCategory: [] };
    expect(ids(topFacts(onlyGood))).toEqual(["good"]);
    expect(topFacts({ facts: [], byCategory: [] })).toEqual([]);
  });

  it("limits what Today shows", () => {
    const many = { facts: Array.from({ length: 8 }, (_, i) => fact(`w${i}`, "warning", 8 - i)), byCategory: [] };
    expect(topFacts(many)).toHaveLength(3);
    expect(topFacts(many, 5)).toHaveLength(5);
  });

  it("groups facts by category, leaves out empty groups, and is empty when there is nothing", () => {
    const all = buildInsights(
      input({
        current: [person("a", "Rahim", "2026-11", lates(2), 12)],
        previous: [],
        devices: [{ id: "d", serialNo: "SN1", name: "Front door", lastSeenAt: new Date(NOW.getTime() - 3 * 3_600_000), clockOffsetSeconds: null, clockCheckedAt: null, active: true } as DeviceRow],
      }),
    );
    expect(all.byCategory.map((g) => g.category)).toEqual(["people", "office"]);
    expect(buildInsights(input())).toEqual({ facts: [], byCategory: [] });
  });

  it("writes every sentence in plain style: no em dashes, no all capitals", () => {
    const everything = buildInsights(
      input({
        current: [person("a", "Rahim", "2026-11", { ...lates(6), 7: { missingOut: true }, 8: { missingOut: true }, 9: { missingOut: true }, 10: absent, 11: absent }, 12)],
        previous: [person("a", "Rahim", "2026-10", lates(1), 31)],
        balances: [{ employeeId: "a", employeeName: "Rahim", leaveTypeName: "Casual leave", quota: 10, remaining: 0 }],
        payroll: [{ month: "2026-10", net: 700_000, people: 5 }, { month: "2026-09", net: 600_000, people: 4 }],
      }),
    );
    expect(everything.facts.length).toBeGreaterThan(3);
    for (const fact of everything.facts) {
      expect(fact.text, fact.id).not.toContain("—");
      expect(fact.text, fact.id).not.toMatch(/\b[A-Z]{4,}\b/);
      expect(fact.text.endsWith("."), fact.id).toBe(true);
    }
  });
});
