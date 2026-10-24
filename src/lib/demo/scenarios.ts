import type { PayrollAdjustmentType } from "@/db/schema";
import { daysInMonth, eachDate, weekdayOf } from "@/lib/time";

/**
 * Demo data: eight made-up employees and one month of punches, each person
 * there to show one case the system must get right. The plan is plain data,
 * built from the month and the office's weekly off days, so the demo script,
 * the tests and the expected figures all start from the same story.
 *
 * Days are picked by their place among the month's working days (weekly off
 * days and the demo holiday removed), so the story is the same in any month.
 * The shift is 09:00 to 18:00 with 10 minutes of grace: arriving at 09:10 is on
 * time and 09:11 is late.
 */

export type DemoPunch = {
  date: string;
  /** "HH:MM" or "HH:MM:SS", office time. */
  time: string;
};

export type DemoLeave = { fromDate: string; toDate: string; kind: "paid" | "unpaid" };

export type DemoEmployee = {
  /** What this person shows, like "on_time". Stable: fixtures use it. */
  key: string;
  empCode: string;
  name: string;
  department: string;
  designation: string;
  joinDate: string;
  salary: { gross: string; basicPct: string; housePct: string; medicalPct: string; conveyancePct: string; effectiveMonth: string };
  punches: DemoPunch[];
  leave: DemoLeave[];
  adjustments: { type: PayrollAdjustmentType; amount: string; note: string }[];
};

export type DemoPlan = {
  month: string;
  /** The made-up public holiday, the 8th working day. */
  holiday: { date: string; name: string };
  /** Every working day of the month, without the holiday. */
  workingDates: string[];
  employees: DemoEmployee[];
};

export const DEMO_SHIFT = { name: "Demo day shift", startTime: "09:00", endTime: "18:00", graceMinutes: 10 } as const;
export const DEMO_EMPLOYEE_COUNT = 8;

/** The most working days the story needs. A month with fewer cannot hold it. */
const MIN_WORKING_DAYS = 19;

export function buildDemoPlan(month: string, weeklyOffDays: readonly number[], empCodes: readonly string[]): DemoPlan {
  if (empCodes.length !== DEMO_EMPLOYEE_COUNT) throw new Error(`The demo needs ${DEMO_EMPLOYEE_COUNT} employee codes.`);

  const dates = eachDate(`${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, "0")}`);
  const open = dates.filter((d) => !weeklyOffDays.includes(weekdayOf(d)));
  const holidayDate = open[7];
  const W = open.filter((d) => d !== holidayDate);
  if (W.length < MIN_WORKING_DAYS) throw new Error(`The demo needs at least ${MIN_WORKING_DAYS} working days in the month. ${month} has ${W.length}.`);

  const year = Number(month.slice(0, 4));
  const earlier = `${year - 1}-01`;
  const joinedBefore = `${earlier}-01`;
  const day = (i: number) => W[i];
  const full = (indexes: readonly number[], inTime = "08:50", outTime = "18:05"): DemoPunch[] =>
    indexes.flatMap((i) => [
      { date: day(i), time: inTime },
      { date: day(i), time: outTime },
    ]);
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
  const every = range(0, W.length);
  const without = (skip: readonly number[], from = 0) => every.filter((i) => i >= from && !skip.includes(i));
  const salary = (gross: string, basicPct: string, effectiveMonth = earlier) => ({ gross, basicPct, housePct: "20", medicalPct: "10", conveyancePct: "10", effectiveMonth });
  const person = (n: number, over: Omit<DemoEmployee, "empCode" | "joinDate" | "adjustments" | "leave"> & Partial<DemoEmployee>): DemoEmployee => ({
    empCode: empCodes[n],
    joinDate: joinedBefore,
    leave: [],
    adjustments: [],
    ...over,
  });

  // 1. Always on time.
  const onTime = person(0, {
    key: "on_time",
    name: "Anwar Hossain",
    department: "Operations",
    designation: "Operations officer",
    salary: salary("30000.00", "50"),
    punches: full(every),
    adjustments: [{ type: "bonus", amount: "2000.00", note: "Eid bonus" }],
  });

  // 2. Late often: six at 09:25 and one at 09:11 are late, and 09:10 exactly is not.
  const lateDays = [1, 2, 4, 5, 8, 9];
  const frequentLate = person(1, {
    key: "frequent_late",
    name: "Farhana Akter",
    department: "Sales",
    designation: "Sales executive",
    salary: salary("24000.00", "60"),
    punches: [
      ...full(without([...lateDays, 12, 14])),
      ...full(lateDays, "09:25"),
      ...full([12], "09:11"),
      ...full([14], "09:10"),
    ],
  });

  // 3. Absent two days with no leave.
  const absent = person(2, {
    key: "absent_no_leave",
    name: "Mahbub Alam",
    department: "Accounts",
    designation: "Accountant",
    salary: salary("28000.00", "50"),
    punches: full(without([3, 4])),
    adjustments: [{ type: "advance", amount: "5000.00", note: "Advance against salary" }],
  });

  // 4. Away two days on approved paid leave.
  const paidLeave = person(3, {
    key: "absent_paid_leave",
    name: "Nasrin Sultana",
    department: "HR",
    designation: "HR officer",
    salary: salary("26000.00", "50"),
    punches: full(without([6, 7])),
    leave: [{ fromDate: day(6), toDate: day(7), kind: "paid" }],
  });

  // 5. Away two days on approved unpaid leave.
  const unpaidLeave = person(4, {
    key: "absent_unpaid_leave",
    name: "Kamal Hasan",
    department: "Sales",
    designation: "Sales executive",
    salary: salary("32000.00", "50"),
    punches: full(without([10, 11])),
    leave: [{ fromDate: day(10), toDate: day(11), kind: "unpaid" }],
  });

  // 6. Forgot to punch out on three days.
  const forgotOut = [2, 9, 15];
  const forgotten = person(5, {
    key: "forgotten_punch_out",
    name: "Rubina Yasmin",
    department: "Support",
    designation: "Support agent",
    salary: salary("22000.00", "50"),
    punches: [...full(without(forgotOut)), ...forgotOut.map((i) => ({ date: day(i), time: "08:55" }))],
  });

  // 7. The device reads every punch twice a few seconds apart. On one day only the arrival is read (twice), so the
  //    second tap must not count as leaving. One weekly off day is worked as well.
  const tapOnlyDay = 5;
  const offDay = dates.find((d) => weeklyOffDays.includes(weekdayOf(d)) && d !== holidayDate);
  const doubleTap = person(6, {
    key: "double_tap",
    name: "Tanvir Ahmed",
    department: "IT",
    designation: "Systems administrator",
    salary: salary("40000.00", "50"),
    punches: [
      ...every.flatMap((i) => [
        { date: day(i), time: "08:55:00" },
        { date: day(i), time: "08:55:25" },
        ...(i === tapOnlyDay ? [] : [{ date: day(i), time: "18:00:00" }, { date: day(i), time: "18:00:20" }]),
      ]),
      ...(offDay ? [{ date: offDay, time: "10:00" }, { date: offDay, time: "14:00" }] : []),
    ],
  });

  // 8. Joined in the middle of the month, with one late day after joining.
  const joinIndex = 9;
  const joiner = person(7, {
    key: "joined_mid_month",
    name: "Sabina Khatun",
    department: "Marketing",
    designation: "Marketing executive",
    joinDate: day(joinIndex),
    salary: salary("36000.00", "50", month),
    punches: [...full(without([11], joinIndex)), ...full([11], "09:30")],
    adjustments: [{ type: "bonus", amount: "1500.00", note: "Joining bonus" }],
  });

  return {
    month,
    holiday: { date: holidayDate, name: "Demo holiday" },
    workingDates: W,
    employees: [onTime, frequentLate, absent, paidLeave, unpaidLeave, forgotten, doubleTap, joiner],
  };
}
