import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import { buildTodayBoard, type TodayInput } from "@/lib/attendance/today";
import { officeDateTimeToInstant } from "@/lib/time";

const DAY = "2031-03-04";
const at = (time: string) => officeDateTimeToInstant(DAY, time)!;

const blank: DayResult = {
  status: "absent",
  firstIn: null,
  lastOut: null,
  lateMinutes: 0,
  earlyMinutes: 0,
  missingOut: false,
  workedOnOffDay: false,
  punchCount: 0,
  isManual: false,
};

function person(name: string, result: Partial<DayResult>): TodayInput {
  return {
    employee: { id: name, empCode: name.toUpperCase(), name, department: null },
    shift: { name: "Day", startTime: "09:00", endTime: "18:00" },
    result: { ...blank, ...result },
  };
}

describe("buildTodayBoard", () => {
  const people = [
    person("Ana", { status: "present", firstIn: at("08:55"), punchCount: 1, missingOut: true }),
    person("Bela", { status: "late", firstIn: at("09:40"), lateMinutes: 40, punchCount: 1, missingOut: true }),
    person("Chand", { status: "absent" }),
    person("Dipa", { status: "leave_paid" }),
  ];

  it("counts people in, late and on leave, and shows no-shows as not in yet while the shift runs", () => {
    const board = buildTodayBoard(people, at("11:00"));
    expect(board.counts).toEqual({ in: 2, late: 1, onLeave: 1, notInYet: 1, absent: 0 });
    expect(board.offDay).toBeNull();
    expect(board.entries.map((e) => [e.name, e.group])).toEqual([
      ["Ana", "in"],
      ["Bela", "in"],
      ["Chand", "not_in_yet"],
      ["Dipa", "on_leave"],
    ]);
  });

  it("turns not in yet into absent once the shift is over", () => {
    expect(buildTodayBoard(people, at("17:59")).counts.absent).toBe(0);
    const board = buildTodayBoard(people, at("18:00"));
    expect(board.counts).toMatchObject({ notInYet: 0, absent: 1 });
  });

  it("uses the office clock, not the server's", () => {
    // 19:00 in Dhaka is 13:00 UTC, so the shift (ends 18:00) only reads as over on the Dhaka clock.
    expect(buildTodayBoard(people, at("19:00")).counts.absent).toBe(1);
  });

  it("reports a weekly off day, lists nobody as absent, and keeps people who came in", () => {
    const board = buildTodayBoard(
      [
        person("Ana", { status: "weekly_off" }),
        person("Bela", { status: "weekly_off", firstIn: at("10:00"), workedOnOffDay: true, punchCount: 1, missingOut: true }),
      ],
      at("12:00"),
    );
    expect(board.offDay).toBe("weekly_off");
    expect(board.counts).toEqual({ in: 1, late: 0, onLeave: 0, notInYet: 0, absent: 0 });
    expect(board.entries.map((e) => [e.name, e.group])).toEqual([
      ["Ana", "off"],
      ["Bela", "worked_off_day"],
    ]);
  });

  it("calls a holiday a holiday even when it falls on a weekly off day", () => {
    expect(buildTodayBoard([person("Ana", { status: "holiday" })], at("12:00")).offDay).toBe("holiday");
  });

  it("sorts by name and handles an empty office", () => {
    const board = buildTodayBoard([person("Zed", {}), person("Abe", {})], at("10:00"));
    expect(board.entries.map((e) => e.name)).toEqual(["Abe", "Zed"]);
    expect(buildTodayBoard([], at("10:00"))).toEqual({
      offDay: null,
      counts: { in: 0, late: 0, onLeave: 0, notInYet: 0, absent: 0 },
      entries: [],
    });
  });
});
