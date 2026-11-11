import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import { arrivalBuckets, buildPunchFeed, buildTodayBoard, type TodayInput } from "@/lib/attendance/today";
import {
  arrivalStats,
  describeFeedItem,
  describeTodayEntry,
  mainShiftStart,
  minutesPastStart,
  sortBoardEntries,
  todaySummary,
} from "@/lib/attendance/today-summary";
import { officeDateTimeToInstant, officeMinuteOfDay } from "@/lib/time";

const DAY = "2031-03-04";
const at = (time: string) => officeDateTimeToInstant(DAY, time)!;
const minute = (time: string) => officeMinuteOfDay(at(time));

const blank: DayResult = { status: "absent", firstIn: null, lastOut: null, lateMinutes: 0, earlyMinutes: 0, missingOut: false, workedOnOffDay: false, punchCount: 0, isManual: false };

function person(name: string, result: Partial<DayResult>, start = "09:00"): TodayInput {
  return { employee: { id: name, empCode: name.toUpperCase(), name, department: "Sales" }, shift: { name: "Day", startTime: `${start}:00`, endTime: "18:00:00" }, result: { ...blank, ...result } };
}
const present = (time: string) => ({ status: "present" as const, firstIn: at(time), punchCount: 1, missingOut: true });
const late = (time: string, minutes: number) => ({ status: "late" as const, firstIn: at(time), lateMinutes: minutes, punchCount: 1, missingOut: true });
const summaryAt = (people: TodayInput[], time: string) => todaySummary(buildTodayBoard(people, at(time)), minute(time));

describe("buildTodayBoard", () => {
  it("gives each person their shift start", () => {
    const [entry] = buildTodayBoard([person("Ana", {}, "10:30")], at("09:00")).entries;
    expect(entry).toMatchObject({ shiftStart: "10:30", shiftStartMinute: 630 });
  });
});

describe("todaySummary", () => {
  it("counts who is due without the people on leave", () => {
    const s = summaryAt([person("Ana", present("08:55")), person("Bela", {}), person("Chand", { status: "leave_paid" })], "09:30");
    expect(s).toMatchObject({ due: 2, inCount: 1, percent: 50, overdue: 1 });
  });

  it("says who is past their start time, and when everyone waiting is", () => {
    const people = [person("Ana", present("08:55")), person("Bela", {}), person("Chand", {}, "10:00")];
    expect(summaryAt(people, "09:30").subline).toBe("2 not in yet, 1 past their start time");
    expect(summaryAt([person("Ana", present("08:55")), person("Bela", {}), person("Chand", {})], "09:30").subline).toBe("2 not in yet, all past their start time");
    expect(summaryAt([person("Ana", present("08:55")), person("Bela", {})], "09:30").subline).toBe("1 not in yet, and past their start time");
  });

  it("says when the shift starts before anyone is due", () => {
    expect(summaryAt([person("Ana", {}), person("Bela", {})], "08:00").subline).toBe("2 not in yet. The shift starts 09:00.");
    expect(summaryAt([person("Ana", present("08:40")), person("Bela", {}, "10:00")], "09:10").subline).toBe("1 not in yet. The next shift starts 10:00.");
  });

  it("leads with absences once the shift is over", () => {
    const s = summaryAt([person("Ana", late("09:40", 40)), person("Bela", {}), person("Chand", {})], "18:30");
    expect(s.subline).toBe("2 people absent, 1 late");
    expect(s.percent).toBe(33);
  });

  it("says when everyone is in, with or without lates", () => {
    const good = summaryAt([person("Ana", present("08:55")), person("Bela", present("08:50"))], "10:00");
    expect(good).toMatchObject({ subline: "Everyone is in, and on time", allGood: true, percent: 100 });
    const lates = summaryAt([person("Ana", present("08:55")), person("Bela", late("09:30", 30))], "10:00");
    expect(lates).toMatchObject({ subline: "Everyone is in. 1 person came late.", allGood: false });
  });

  it("handles a day off, with and without people coming in", () => {
    const off = summaryAt([person("Ana", { status: "weekly_off" }), person("Bela", { status: "weekly_off" })], "10:00");
    expect(off).toMatchObject({ due: 0, inCount: 0, percent: null, subline: "A weekly off day. Nobody is due in." });
    const holiday = summaryAt([person("Ana", { status: "holiday", workedOnOffDay: true, firstIn: at("10:00"), punchCount: 1 }), person("Bela", { status: "holiday" })], "11:00");
    expect(holiday).toMatchObject({ due: 0, inCount: 1, subline: "1 person came in on the day off" });
  });

  it("says so when everyone due is on leave", () => {
    expect(summaryAt([person("Ana", { status: "leave_paid" })], "10:00").subline).toBe("Everyone due today is on leave");
  });
});

describe("minutesPastStart", () => {
  const entry = (time: string, input = person("Ana", {})) => buildTodayBoard([input], at(time)).entries[0];

  it("counts from the start for someone not in, and is null before it or for anyone else", () => {
    expect(minutesPastStart(entry("09:40"), minute("09:40"))).toBe(40);
    expect(minutesPastStart(entry("09:00"), minute("09:00"))).toBeNull();
    expect(minutesPastStart(entry("08:30"), minute("08:30"))).toBeNull();
    expect(minutesPastStart(entry("09:40", person("Ana", present("08:55"))), minute("09:40"))).toBeNull();
    expect(minutesPastStart(entry("18:30"), minute("18:30"))).toBeNull();
  });
});

describe("sortBoardEntries", () => {
  it("lists the longest overdue first, then late arrivals, then by arrival time", () => {
    const people = [
      person("Zed", present("08:40")),
      person("Yan", late("09:45", 45)),
      person("Xiu", late("09:20", 20)),
      person("Will", present("08:30")),
      person("Vic", {}, "10:00"),
      person("Uma", {}, "09:00"),
      person("Tim", {}, "08:00"),
      person("Sam", { status: "leave_paid" }),
    ];
    const sorted = sortBoardEntries(buildTodayBoard(people, at("09:50")).entries, minute("09:50"));
    expect(sorted.map((e) => e.name)).toEqual(["Tim", "Uma", "Vic", "Yan", "Xiu", "Will", "Zed", "Sam"]);
  });
});

describe("mainShiftStart", () => {
  it("is the start most people share, the earlier one on a tie, and null with nobody", () => {
    const entries = (starts: string[]) => buildTodayBoard(starts.map((s, i) => person(`P${i}`, {}, s)), at("07:00")).entries;
    expect(mainShiftStart(entries(["09:00", "09:00", "10:00"]))).toBe(540);
    expect(mainShiftStart(entries(["10:00", "09:00"]))).toBe(540);
    expect(mainShiftStart([])).toBeNull();
  });
});

describe("arrivals", () => {
  const entries = buildTodayBoard([person("Ana", present("08:50")), person("Bela", present("08:56")), person("Chand", late("09:20", 20)), person("Dipa", {})], at("11:00")).entries;

  it("gives the first, the middle arrival and the lates", () => {
    expect(arrivalStats(entries)).toEqual({ total: 3, first: "08:50", median: "08:56", late: 1 });
    expect(arrivalStats(entries.slice(0, 2))).toEqual({ total: 2, first: "08:50", median: "08:53", late: 0 });
    expect(arrivalStats([])).toEqual({ total: 0, first: null, median: null, late: 0 });
  });

  it("widens the chart around the shift start, and is unchanged without one", () => {
    const one = buildTodayBoard([person("Ana", present("08:50"))], at("11:00")).entries;
    expect(arrivalBuckets(one).map((b) => b.label)).toEqual(["08:45"]);
    expect(arrivalBuckets(one, 15, { around: 540 }).map((b) => b.label)).toEqual(["08:15", "08:30", "08:45", "09:00", "09:15", "09:30", "09:45"]);
    expect(arrivalBuckets(one, 15, { around: null }).map((b) => b.label)).toEqual(["08:45"]);
  });
});

describe("describeFeedItem", () => {
  const board = buildTodayBoard([person("Ana", present("08:50")), person("Bela", late("09:25", 25))], at("11:00"));
  const feed = buildPunchFeed(
    [
      { empCode: "ANA", at: at("08:50"), deviceName: "Front door" },
      { empCode: "BELA", at: at("09:25"), deviceName: "Front door" },
      { empCode: "ANA", at: at("10:30"), deviceName: "Back door" },
      { empCode: "99", at: at("10:40"), deviceName: "Front door" },
    ],
    board.entries,
  );
  const byCode = new Map(board.entries.map((e) => [e.empCode, e]));
  const lines = (devices: number) => feed.map((item) => describeFeedItem(item, byCode.get(item.empCode), devices));

  it("says how the person arrived, and names the device only when there is more than one", () => {
    expect(lines(1)).toEqual(["Arrived", "Punched again", "Arrived, 25 min late", "Arrived, on time"]);
    expect(lines(2)[1]).toBe("Punched again, Back door");
  });
});

describe("describeTodayEntry", () => {
  const view = (input: TodayInput, time: string, track = true) => describeTodayEntry(buildTodayBoard([input], at(time)).entries[0], track, minute(time));

  it("shows the arrival time for people who are in, and a badge only when late", () => {
    expect(view(person("Ana", present("08:50")), "10:00")).toMatchObject({ tone: "success", time: "08:50", badge: null, note: "On time", out: "Not out yet", detail: "In 08:50, not out yet" });
    expect(view(person("Ana", late("09:25", 25)), "10:00")).toMatchObject({ tone: "warning", time: "09:25", badge: "25 min late", note: null });
    expect(view(person("Ana", { ...present("08:50"), lastOut: at("18:05") }), "19:00").out).toBe("Out 18:05");
  });

  it("leaves the leaving time out when the leaving punch is off", () => {
    expect(view(person("Ana", present("08:50")), "10:00", false)).toMatchObject({ out: null, detail: "In 08:50" });
  });

  it("says when someone is due, and warns once they are past their start", () => {
    expect(view(person("Ana", {}), "08:30")).toMatchObject({ tone: "off", note: "Due 09:00", noteWarns: false, badge: null });
    expect(view(person("Ana", {}), "09:40")).toMatchObject({ tone: "warning", note: "40 min past start", noteWarns: true, detail: "Due 09:00, 40 min past start" });
  });

  it("uses a badge for absent and leave", () => {
    expect(view(person("Ana", {}), "18:30")).toMatchObject({ tone: "danger", badge: "Absent", note: null });
    expect(view(person("Ana", { status: "leave_unpaid" }), "10:00")).toMatchObject({ tone: "info", badge: "Unpaid leave" });
    expect(view(person("Ana", { status: "leave_paid" }), "10:00").badge).toBe("Paid leave");
  });
});
