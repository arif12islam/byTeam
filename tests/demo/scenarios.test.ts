import { describe, expect, it } from "vitest";

import { buildDemoPlan, DEMO_EMPLOYEE_COUNT, type DemoEmployee } from "@/lib/demo/scenarios";
import { eachDate, weekdayOf } from "@/lib/time";

const CODES = Array.from({ length: DEMO_EMPLOYEE_COUNT }, (_, i) => String(9001 + i));
const FRI_SAT = [5, 6];

// March 2017 starts on a Wednesday. With Friday and Saturday off it has 22 working days.
// The made-up holiday is the 8th of them, Sunday 12 March, which leaves 21.
const plan = buildDemoPlan("2017-03", FRI_SAT, CODES);
const byKey = (key: string): DemoEmployee => plan.employees.find((e) => e.key === key)!;
const punchesOn = (e: DemoEmployee, date: string) => e.punches.filter((p) => p.date === date).map((p) => p.time);

describe("buildDemoPlan", () => {
  it("has eight people, one for each case, with the codes given", () => {
    expect(plan.employees.map((e) => e.key)).toEqual([
      "on_time",
      "frequent_late",
      "absent_no_leave",
      "absent_paid_leave",
      "absent_unpaid_leave",
      "forgotten_punch_out",
      "double_tap",
      "joined_mid_month",
    ]);
    expect(plan.employees.map((e) => e.empCode)).toEqual(CODES);
    expect(new Set(plan.employees.map((e) => e.name)).size).toBe(8);
  });

  it("makes the 8th working day a holiday and leaves 21 working days", () => {
    expect(plan.holiday).toEqual({ date: "2017-03-12", name: "Demo holiday" });
    expect(plan.workingDates).toHaveLength(21);
    expect(plan.workingDates).not.toContain("2017-03-12");
    expect(plan.workingDates.slice(0, 8)).toEqual(["2017-03-01", "2017-03-02", "2017-03-05", "2017-03-06", "2017-03-07", "2017-03-08", "2017-03-09", "2017-03-13"]);
    for (const date of plan.workingDates) expect(FRI_SAT).not.toContain(weekdayOf(date));
  });

  it("gives the always on time person two punches on every working day and none on days off", () => {
    const e = byKey("on_time");
    expect(e.punches).toHaveLength(42);
    for (const date of plan.workingDates) expect(punchesOn(e, date)).toEqual(["08:50", "18:05"]);
    expect(e.punches.some((p) => !plan.workingDates.includes(p.date))).toBe(false);
  });

  it("makes the late person late seven times, with one arrival on the grace limit and one a minute past it", () => {
    const e = byKey("frequent_late");
    const arrivals = plan.workingDates.map((d) => punchesOn(e, d).sort()[0]);
    expect(arrivals).toHaveLength(21);
    expect(arrivals.filter((t) => t === "09:25")).toHaveLength(6);
    expect(arrivals.filter((t) => t === "09:11")).toHaveLength(1);
    expect(arrivals.filter((t) => t === "09:10")).toHaveLength(1);
  });

  it("leaves two working days without any punch for the absent person, and for each leave taker", () => {
    const noPunches = (e: DemoEmployee) => plan.workingDates.filter((d) => punchesOn(e, d).length === 0);
    expect(noPunches(byKey("absent_no_leave"))).toEqual([plan.workingDates[3], plan.workingDates[4]]);
    expect(noPunches(byKey("absent_paid_leave"))).toEqual([plan.workingDates[6], plan.workingDates[7]]);
    expect(noPunches(byKey("absent_unpaid_leave"))).toEqual([plan.workingDates[10], plan.workingDates[11]]);
    expect(byKey("absent_no_leave").leave).toEqual([]);
    expect(byKey("absent_paid_leave").leave).toEqual([{ fromDate: plan.workingDates[6], toDate: plan.workingDates[7], kind: "paid" }]);
    expect(byKey("absent_unpaid_leave").leave).toEqual([{ fromDate: plan.workingDates[10], toDate: plan.workingDates[11], kind: "unpaid" }]);
  });

  it("gives the forgetful person only an arrival on three days", () => {
    const e = byKey("forgotten_punch_out");
    expect(plan.workingDates.filter((d) => punchesOn(e, d).length === 1)).toEqual([plan.workingDates[2], plan.workingDates[9], plan.workingDates[15]]);
  });

  it("gives the double tap person four punches a day, two on one day, and one worked day off", () => {
    const e = byKey("double_tap");
    const tapOnly = plan.workingDates[5];
    for (const date of plan.workingDates.filter((d) => d !== tapOnly)) expect(punchesOn(e, date)).toEqual(["08:55:00", "08:55:25", "18:00:00", "18:00:20"]);
    // On this day only the arrival was read, twice. The second tap is not leaving.
    expect(punchesOn(e, tapOnly)).toEqual(["08:55:00", "08:55:25"]);
    const offDays = [...new Set(e.punches.map((p) => p.date))].filter((d) => !plan.workingDates.includes(d));
    expect(offDays).toEqual(["2017-03-03"]); // the first Friday
    expect(punchesOn(e, "2017-03-03")).toEqual(["10:00", "14:00"]);
  });

  it("starts the new joiner on the 10th working day, with no punches before", () => {
    const e = byKey("joined_mid_month");
    expect(e.joinDate).toBe(plan.workingDates[9]);
    expect(e.joinDate).toBe("2017-03-15");
    expect(e.punches.every((p) => p.date >= e.joinDate)).toBe(true);
    expect(punchesOn(e, plan.workingDates[11])).toEqual(["09:30", "18:05"].sort());
    // Everyone else joined before the month.
    for (const other of plan.employees.filter((x) => x.key !== "joined_mid_month")) expect(other.joinDate < "2017-03-01").toBe(true);
  });

  it("has three bonuses and advances, and a salary for everyone from before they joined", () => {
    const adjustments = plan.employees.flatMap((e) => e.adjustments.map((a) => [e.key, a.type, a.amount]));
    expect(adjustments).toEqual([
      ["on_time", "bonus", "2000.00"],
      ["absent_no_leave", "advance", "5000.00"],
      ["joined_mid_month", "bonus", "1500.00"],
    ]);
    for (const e of plan.employees) expect(`${e.salary.effectiveMonth}-01` <= e.joinDate).toBe(true);
  });

  it("keeps every punch and leave day inside the month", () => {
    const inMonth = (d: string) => d.startsWith("2017-03-");
    for (const e of plan.employees) {
      expect(e.punches.every((p) => inMonth(p.date))).toBe(true);
      expect(e.leave.every((l) => inMonth(l.fromDate) && inMonth(l.toDate))).toBe(true);
    }
  });

  it("tells the same story in other months and with other days off", () => {
    for (const [month, off] of [["2026-09", [5, 6]], ["2026-02", [5, 6]], ["2028-02", [5]], ["2026-10", [0]]] as const) {
      const other = buildDemoPlan(month, off, CODES);
      expect(other.employees).toHaveLength(8);
      expect(other.workingDates.length).toBeGreaterThanOrEqual(19);
      expect(other.workingDates).not.toContain(other.holiday.date);
      expect(eachDate(`${month}-01`, `${month}-28`)).toContain(other.holiday.date);
      expect(other.employees.find((e) => e.key === "absent_paid_leave")!.leave[0].fromDate).toBe(other.workingDates[6]);
    }
  });

  it("refuses a wrong number of codes and a month that is too short on working days", () => {
    expect(() => buildDemoPlan("2017-03", FRI_SAT, CODES.slice(0, 7))).toThrow(/8 employee codes/);
    expect(() => buildDemoPlan("2017-03", [0, 1, 2, 3, 4, 5], CODES)).toThrow(/at least 19 working days/);
    expect(() => buildDemoPlan("2026-02", [4, 5, 6], CODES)).toThrow(/at least 19 working days/);
  });
});
