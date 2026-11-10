import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import type { DeviceRow } from "@/lib/devices/devices";
import {
  absenceNextToOffDays,
  absentStreak,
  backOnTrack,
  buildInsights,
  deviceFacts,
  factsForToday,
  forgotToPunchOut,
  lateMinutesUp,
  latePattern,
  lateStreak,
  latesTrend,
  latesUp,
  leftEarly,
  limitPerPerson,
  lowLeaveBalance,
  nearLateDeduction,
  payrollChange,
  perfectAttendance,
  rankFacts,
  topFacts,
  unmatchedCodes,
  withoutPeople,
  worstWeekday,
  type Fact,
} from "@/lib/insights/facts";

import { officeDateTimeToInstant } from "@/lib/time";

import { absent, input, late, lates, NOW, person } from "./fixtures";

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
    expect(facts[0]).toMatchObject({ id: "lates-up:a", tone: "warning", category: "people", href: "/attendance/a?month=2026-11", subject: "a" });
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
    expect(facts.find((f) => f.id === "forgot-out:a")?.text).toBe("Sharif has no leaving punch on 3 days this month. Open the oldest to add the leaving time.");
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

  it("is not spoilt by today, when someone has not punched in yet", () => {
    const [n1, o1] = clean("Nasrin", "a");
    const today = person("a", "Nasrin", "2026-11", { 12: absent }, 12);
    expect(perfectAttendance(input({ current: [today], previous: [o1] }))).toHaveLength(1);
    expect(perfectAttendance(input({ current: [person("a", "Nasrin", "2026-11", { 11: absent }, 12)], previous: [o1] }))).toEqual([]);
    expect(n1).toBeDefined();
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

  it("does not count today, which is not over: nobody is absent before their shift ends", () => {
    // 9 Nov is today here, a Monday; four people have not punched in yet.
    const notInYet = (id: string) => person(id, id, "2026-11", { 9: absent }, 9);
    expect(worstWeekday(input({ today: "2026-11-09", now: officeDateTimeToInstant("2026-11-09", "10:00")!, current: ["a", "b", "c", "d"].map(notInYet) }))).toEqual([]);
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
    expect(fact).toMatchObject({ category: "payroll", tone: "info", href: "/payroll?month=2026-10" });
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

  it("leaves out of the Today card what Today already shows in its own banners", () => {
    const facts = [fact("device-offline:SN1", "danger", 100, "office"), fact("unmatched:23", "warning", 5, "office"), fact("lates-up:a", "warning", 3), fact("device-clock:SN1", "warning", 4, "office")];
    expect(ids(factsForToday({ facts, byCategory: [] }))).toEqual(["lates-up:a", "device-clock:SN1"]);
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


// ---- Rules about one person over the last two months ----
// TODAY is Thursday 12 Nov 2026, so 1 and 8 Nov are Sundays and 6 Nov is a Friday. October 2026 starts on a Thursday.

const off = { status: "weekly_off" as const, punchCount: 0 };
const range = (from: number, to: number, over: Partial<DayResult>) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, over]));
const mine = (days: Record<number, Partial<DayResult>>, last = 12) => [person("a", "Rahim", "2026-11", days, last)];

describe("absentStreak", () => {
  it("names someone absent on the latest working days and opens the first of them", () => {
    const [fact] = absentStreak(input({ current: mine({ 10: absent, 11: absent }) }));
    expect(fact).toMatchObject({ id: "absent-streak:a", tone: "danger", subject: "a", href: "/attendance/a/2026-11-10?from=person" });
    expect(fact.text).toContain("absent 2 working days in a row, since");
    expect(fact.text).toContain("Worth a call.");
  });

  it("does not count today, a present day in between, or a person with no record for yesterday", () => {
    expect(absentStreak(input({ current: mine({ 11: absent, 12: absent }) }))).toEqual([]);
    expect(absentStreak(input({ current: mine({ 9: absent, 10: { status: "present" }, 11: absent }) }))).toEqual([]);
    expect(absentStreak(input({ current: mine({ 9: absent, 10: absent }, 10) }))).toEqual([]);
  });

  it("is not broken by a day off or a holiday in between", () => {
    const [fact] = absentStreak(input({ current: mine({ 9: absent, 10: off, 11: absent }) }));
    expect(fact.text).toContain("absent 2 working days in a row");
  });

  it("says at least when the run goes back past the start of what it can see", () => {
    const previous = [person("a", "Rahim", "2026-10", range(1, 31, absent), 31)];
    const [fact] = absentStreak(input({ current: mine(range(1, 11, absent)), previous }));
    expect(fact.text).toContain("for at least");
  });
});

describe("lateStreak", () => {
  it("names someone late on each of the last 4 or more working days", () => {
    const [fact] = lateStreak(input({ current: mine(range(8, 11, late)) }));
    expect(fact).toMatchObject({ id: "late-streak:a", tone: "warning", href: "/attendance/a?month=2026-11" });
    expect(fact.text).toBe("Rahim was late on each of the last 4 working days.");
  });

  it("needs 4 in a row, ending on the last working day", () => {
    expect(lateStreak(input({ current: mine(range(9, 11, late)) }))).toEqual([]);
    expect(lateStreak(input({ current: mine({ ...range(7, 10, late), 11: { status: "present" } }) }))).toEqual([]);
  });
});

describe("latePattern", () => {
  const mondays = (month: string, days: number[]) => Object.fromEntries(days.map((d) => [d, late]));

  it("names the weekday someone is mostly late on", () => {
    const previous = [person("a", "Rahim", "2026-10", mondays("2026-10", [5, 12, 19]), 31)];
    const [fact] = latePattern(input({ current: mine({ 2: late }), previous }));
    expect(fact).toMatchObject({ id: "late-pattern:a", tone: "info" });
    expect(fact.text).toBe("Rahim is late most Mondays: 4 of 4 lates in two months.");
  });

  it("says nothing when the lates are spread over the week", () => {
    const previous = [person("a", "Rahim", "2026-10", mondays("2026-10", [5, 12]), 31)];
    expect(latePattern(input({ current: mine({ 3: late, 4: late }), previous }))).toEqual([]);
  });
});

describe("absenceNextToOffDays", () => {
  it("names someone whose absences sit beside days off", () => {
    const [fact] = absenceNextToOffDays(input({ current: mine({ 1: off, 2: absent, 6: off, 5: absent, 8: off, 9: absent }) }));
    expect(fact.text).toBe("Rahim's absences fall next to days off: 3 of 3 in two months.");
  });

  it("says nothing when most absences are in the middle of the week", () => {
    expect(absenceNextToOffDays(input({ current: mine({ 1: off, 2: absent, 8: off, 9: absent, 4: absent, 10: absent }) }))).toEqual([]);
  });
});

describe("lateMinutesUp", () => {
  const long = (minutes: number, n: number) => range(2, 1 + n, { status: "late", lateMinutes: minutes });

  it("names someone whose lates are longer than last month", () => {
    const previous = [person("a", "Rahim", "2026-10", long(20, 3), 31)];
    const [fact] = lateMinutesUp(input({ current: mine(long(40, 3)), previous }));
    expect(fact.text).toContain("Rahim's lates are getting longer: ");
    expect(fact.subject).toBe("a");
  });

  it("needs 1.5 times last month's average and 3 lates", () => {
    const previous = [person("a", "Rahim", "2026-10", long(30, 3), 31)];
    expect(lateMinutesUp(input({ current: mine(long(40, 3)), previous }))).toEqual([]);
    expect(lateMinutesUp(input({ current: mine(long(60, 2)), previous: [person("a", "Rahim", "2026-10", long(20, 3), 31)] }))).toEqual([]);
  });
});

describe("leftEarly", () => {
  const early = { earlyMinutes: 15 };

  it("names someone who left early on 3 or more days", () => {
    const [fact] = leftEarly(input({ current: mine({ 2: early, 3: early, 4: early }) }));
    expect(fact.text).toBe("Rahim left early on 3 days this month.");
  });

  it("says nothing under 3 days or when the leaving punch is off", () => {
    expect(leftEarly(input({ current: mine({ 2: early, 3: early }) }))).toEqual([]);
    expect(leftEarly(input({ current: mine({ 2: early, 3: early, 4: early }), trackLeavingPunch: false }))).toEqual([]);
  });
});

describe("backOnTrack", () => {
  const rough = [person("a", "Rahim", "2026-10", lates(4), 31)];

  it("names someone on time for 10 or more working days after a rough month", () => {
    const [fact] = backOnTrack(input({ current: mine({}), previous: rough }));
    expect(fact).toMatchObject({ id: "back-on-track:a", tone: "success" });
    expect(fact.text).toBe("Rahim has been on time for 11 working days, after 4 lates and absences last month.");
  });

  it("needs the rough month and the run", () => {
    expect(backOnTrack(input({ current: mine({ 5: late }), previous: rough }))).toEqual([]);
    expect(backOnTrack(input({ current: mine({}), previous: [person("a", "Rahim", "2026-10", lates(3), 31)] }))).toEqual([]);
  });
});

describe("limitPerPerson", () => {
  const f = (kind: string, subject: string, weight = 1): Fact => ({ id: `${kind}:${subject}`, category: "people", tone: "info", text: kind, href: null, subject, weight });
  const kinds = (facts: Fact[]) => facts.map((x) => x.id.split(":")[0]);

  it("lets the bigger rule replace the one it contains", () => {
    expect(kinds(limitPerPerson([f("absent-streak", "a"), f("absent-next-to-off", "a")]))).toEqual(["absent-streak"]);
    expect(kinds(limitPerPerson([f("late-streak", "a"), f("lates-up", "a"), f("late-pattern", "a"), f("late-longer", "a")]))).toEqual(["late-streak"]);
    expect(kinds(limitPerPerson([f("lates-up", "a"), f("late-pattern", "a")]))).toEqual(["lates-up"]);
  });

  it("gives one person at most 2 facts, but always keeps the one about pay", () => {
    const kept = limitPerPerson([f("left-early", "a"), f("forgot-out", "a"), f("leaves", "a"), f("near-deduction", "a")]);
    expect(kinds(kept)).toEqual(["left-early", "forgot-out", "near-deduction"]);
  });

  it("does not limit facts about nobody in particular", () => {
    const facts: Fact[] = ["a", "b", "c"].map((id) => ({ id, category: "people", tone: "info", text: id, href: null, weight: 1 }));
    expect(limitPerPerson(facts)).toHaveLength(3);
  });
});

describe("buildInsights with the new rules", () => {
  it("links people to their calendar, keeps ids unique and never writes an em dash", () => {
    const current = [
      person("a", "Rahim", "2026-11", { ...range(8, 11, late), 2: { earlyMinutes: 10 }, 3: { earlyMinutes: 10 }, 4: { earlyMinutes: 10 } }, 12),
      person("b", "Karim", "2026-11", { 10: absent, 11: absent }, 12),
    ];
    const { facts } = buildInsights(input({ current }));
    expect(new Set(ids(facts)).size).toBe(facts.length);
    expect(facts.every((x) => !x.text.includes("\u2014"))).toBe(true);
    for (const x of facts.filter((y) => y.subject)) expect(x.href).toMatch(/^\/attendance\/(a|b)(\/|\?)/);
    expect(facts.filter((x) => x.subject === "a").length).toBeLessThanOrEqual(3);
  });
});

describe("withoutPeople", () => {
  it("takes people out of both months and their balances, and keeps pay totals", () => {
    const base = input({
      current: [person("a", "Rahim", "2026-11", lates(6), 12), person("b", "Karim", "2026-11", lates(6), 12)],
      previous: [person("a", "Rahim", "2026-10", lates(1), 31), person("b", "Karim", "2026-10", lates(1), 31)],
      balances: [
        { employeeId: "a", quota: 10, remaining: 0, employeeName: "Rahim", leaveTypeName: "Casual" },
        { employeeId: "b", quota: 10, remaining: 0, employeeName: "Karim", leaveTypeName: "Casual" },
      ],
      payroll: [{ month: "2026-10", net: 100, people: 2 }],
    });
    const left = withoutPeople(base, new Set(["a"]));
    expect(left.current.rows.map((r) => r.employee.id)).toEqual(["b"]);
    expect(left.previous.rows.map((r) => r.employee.id)).toEqual(["b"]);
    expect(left.balances.map((b) => b.employeeId)).toEqual(["b"]);
    expect(left.payroll).toEqual(base.payroll);
    expect(buildInsights(left).facts.some((f) => f.subject === "a")).toBe(false);
    expect(buildInsights(base).facts.some((f) => f.subject === "a")).toBe(true);
  });

  it("returns the same input when nobody is left out", () => {
    const base = input();
    expect(withoutPeople(base, new Set())).toBe(base);
  });
});
