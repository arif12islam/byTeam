import { describe, expect, it } from "vitest";

import { computeDay, MIN_PUNCH_SPAN_MINUTES, type DayInput } from "@/lib/attendance/compute-day";
import { officeDateTimeToInstant } from "@/lib/time";

/** A Dhaka clock time on 2026-10-26 (a Monday), as an instant. */
function at(time: string, date = "2026-10-26"): Date {
  const instant = officeDateTimeToInstant(date, time);
  if (!instant) throw new Error(`bad test time ${date} ${time}`);
  return instant;
}

const MONDAY = "2026-10-26";
const FRIDAY = "2026-10-30";
const SATURDAY = "2026-10-31";

/** Office open Monday to Thursday plus Sunday; Friday and Saturday off. Shift 09:00 to 18:00 with 10 minutes grace. */
function day(overrides: Partial<DayInput> = {}): DayInput {
  return {
    date: MONDAY,
    employee: { joinDate: "2026-01-01", exitDate: null },
    shift: { startTime: "09:00", endTime: "18:00", graceMinutes: 10 },
    weeklyOffDays: [5, 6],
    isHoliday: false,
    punches: [],
    leave: null,
    ...overrides,
  };
}

describe("employment dates", () => {
  it("has no row before the join date", () => {
    expect(computeDay(day({ employee: { joinDate: "2026-10-27", exitDate: null } }))).toBeNull();
  });

  it("has a row on the join date", () => {
    expect(computeDay(day({ employee: { joinDate: MONDAY, exitDate: null } }))?.status).toBe("absent");
  });

  it("has a row on the exit date and none after it", () => {
    expect(computeDay(day({ employee: { joinDate: "2026-01-01", exitDate: MONDAY } }))?.status).toBe("absent");
    expect(computeDay(day({ employee: { joinDate: "2026-01-01", exitDate: "2026-10-25" } }))).toBeNull();
  });
});

describe("day type", () => {
  it("is absent on a working day with no punch", () => {
    expect(computeDay(day())).toMatchObject({ status: "absent", firstIn: null, lastOut: null, punchCount: 0, missingOut: false });
  });

  it("is a weekly off day with no punch", () => {
    expect(computeDay(day({ date: FRIDAY }))).toMatchObject({ status: "weekly_off", workedOnOffDay: false });
    expect(computeDay(day({ date: SATURDAY }))?.status).toBe("weekly_off");
  });

  it("is a holiday, and a holiday beats a weekly off day", () => {
    expect(computeDay(day({ isHoliday: true }))?.status).toBe("holiday");
    expect(computeDay(day({ date: FRIDAY, isHoliday: true }))?.status).toBe("holiday");
  });

  it("treats every day as a working day while no weekly off days are set", () => {
    expect(computeDay(day({ date: FRIDAY, weeklyOffDays: [] }))?.status).toBe("absent");
  });

  it("keeps the day type and flags work when someone punches on an off day", () => {
    const off = computeDay(day({ date: FRIDAY, punches: [at("10:30", FRIDAY), at("14:00", FRIDAY)] }));
    expect(off).toMatchObject({ status: "weekly_off", workedOnOffDay: true, lateMinutes: 0, earlyMinutes: 0 });
    const hol = computeDay(day({ isHoliday: true, punches: [at("09:00"), at("17:00")] }));
    expect(hol).toMatchObject({ status: "holiday", workedOnOffDay: true, lateMinutes: 0, earlyMinutes: 0 });
  });
});

describe("in and out", () => {
  it("is present with the first punch as in and the last as out", () => {
    const r = computeDay(day({ punches: [at("08:55"), at("18:05")] }))!;
    expect(r).toMatchObject({ status: "present", lateMinutes: 0, earlyMinutes: 0, missingOut: false, punchCount: 2, isManual: false });
    expect(r.firstIn?.toISOString()).toBe(at("08:55").toISOString());
    expect(r.lastOut?.toISOString()).toBe(at("18:05").toISOString());
  });

  it("uses the earliest and latest of several punches, whatever order they arrive in", () => {
    const r = computeDay(day({ punches: [at("13:00"), at("18:10"), at("08:50"), at("12:00")] }))!;
    expect(r.firstIn?.toISOString()).toBe(at("08:50").toISOString());
    expect(r.lastOut?.toISOString()).toBe(at("18:10").toISOString());
    expect(r.punchCount).toBe(4);
  });

  it("flags a forgotten punch out: one punch gives an in and no out", () => {
    const r = computeDay(day({ punches: [at("08:58")] }))!;
    expect(r).toMatchObject({ status: "present", lastOut: null, missingOut: true, earlyMinutes: 0 });
  });

  it("treats a double tap as one punch", () => {
    const r = computeDay(day({ punches: [at("08:58:00"), at("08:58:07")] }))!;
    expect(r).toMatchObject({ lastOut: null, missingOut: true, punchCount: 2, earlyMinutes: 0 });
    expect(computeDay(day({ punches: [at("08:58:00"), at("09:02:59")] }))?.lastOut).toBeNull();
  });

  it("counts a later punch as leaving once it is far enough from the first", () => {
    expect(MIN_PUNCH_SPAN_MINUTES).toBe(5);
    expect(computeDay(day({ punches: [at("08:00:00"), at("08:05:00")] }))?.lastOut).not.toBeNull();
  });

  it("ignores punches that belong to other office dates", () => {
    const r = computeDay(day({ punches: [at("17:00", "2026-10-25"), at("09:00"), at("18:00"), at("09:00", "2026-10-27")] }))!;
    expect(r.punchCount).toBe(2);
    expect(r.status).toBe("present");
  });

  it("puts a punch just after midnight in Dhaka on that Dhaka date, not the UTC date", () => {
    const night = new Date("2026-10-25T18:30:00Z"); // 00:30 on 26 October in Dhaka
    expect(computeDay(day({ punches: [night] }))?.punchCount).toBe(1);
    expect(computeDay(day({ date: "2026-10-25", punches: [night] }))?.punchCount).toBe(0);
  });
});

describe("late", () => {
  it("is on time up to the end of the grace minute", () => {
    expect(computeDay(day({ punches: [at("09:00:00"), at("18:00")] }))).toMatchObject({ status: "present", lateMinutes: 0 });
    expect(computeDay(day({ punches: [at("09:10:00"), at("18:00")] }))).toMatchObject({ status: "present", lateMinutes: 0 });
    expect(computeDay(day({ punches: [at("09:10:59"), at("18:00")] }))).toMatchObject({ status: "present", lateMinutes: 0 });
  });

  it("is late from the next minute, counted from the shift start", () => {
    expect(computeDay(day({ punches: [at("09:11:00"), at("18:00")] }))).toMatchObject({ status: "late", lateMinutes: 11 });
    expect(computeDay(day({ punches: [at("09:45:30"), at("18:00")] }))).toMatchObject({ status: "late", lateMinutes: 45 });
  });

  it("is never late for arriving before the shift starts", () => {
    expect(computeDay(day({ punches: [at("06:30"), at("18:00")] }))).toMatchObject({ status: "present", lateMinutes: 0 });
  });

  it("works with no grace minutes", () => {
    const shift = { startTime: "09:00", endTime: "18:00", graceMinutes: 0 };
    expect(computeDay(day({ shift, punches: [at("09:00:59")] }))?.status).toBe("present");
    expect(computeDay(day({ shift, punches: [at("09:01:00")] }))).toMatchObject({ status: "late", lateMinutes: 1 });
  });

  it("is late on the in punch alone, even when the out is missing", () => {
    expect(computeDay(day({ punches: [at("09:30")] }))).toMatchObject({ status: "late", lateMinutes: 30, missingOut: true });
  });

  it("uses each employee's own shift", () => {
    const early = { startTime: "07:30", endTime: "16:00", graceMinutes: 5 };
    expect(computeDay(day({ shift: early, punches: [at("07:36"), at("16:00")] }))).toMatchObject({ status: "late", lateMinutes: 6 });
    expect(computeDay(day({ shift: early, punches: [at("07:35"), at("16:00")] }))?.status).toBe("present");
  });
});

describe("early", () => {
  it("counts minutes before the shift end, without changing the status", () => {
    expect(computeDay(day({ punches: [at("09:00"), at("17:30")] }))).toMatchObject({ status: "present", earlyMinutes: 30 });
  });

  it("is not early at or after the end", () => {
    expect(computeDay(day({ punches: [at("09:00"), at("18:00")] }))?.earlyMinutes).toBe(0);
    expect(computeDay(day({ punches: [at("09:00"), at("19:45")] }))?.earlyMinutes).toBe(0);
  });

  it("can be late and early on the same day", () => {
    expect(computeDay(day({ punches: [at("09:20"), at("16:45")] }))).toMatchObject({ status: "late", lateMinutes: 20, earlyMinutes: 75 });
  });
});

describe("leave", () => {
  it("turns an absent working day into leave", () => {
    expect(computeDay(day({ leave: { paid: true } }))?.status).toBe("leave_paid");
    expect(computeDay(day({ leave: { paid: false } }))?.status).toBe("leave_unpaid");
  });

  it("does not turn an off day or a holiday into leave", () => {
    expect(computeDay(day({ date: FRIDAY, leave: { paid: true } }))?.status).toBe("weekly_off");
    expect(computeDay(day({ isHoliday: true, leave: { paid: true } }))?.status).toBe("holiday");
  });

  it("outranks present, keeping the punches visible and counting no late or early", () => {
    const r = computeDay(day({ leave: { paid: true }, punches: [at("11:00"), at("15:00")] }))!;
    expect(r).toMatchObject({ status: "leave_paid", lateMinutes: 0, earlyMinutes: 0, punchCount: 2 });
    expect(r.firstIn).not.toBeNull();
  });
});

describe("manual overrides", () => {
  it("is not manual when there are none", () => {
    expect(computeDay(day({ overrides: {}, punches: [at("09:00")] }))?.isManual).toBe(false);
  });

  it("lets a status override replace the computed status", () => {
    const r = computeDay(day({ overrides: { status: "present" } }))!;
    expect(r).toMatchObject({ status: "present", isManual: true, punchCount: 0 });
  });

  it("uses an overridden out time for a forgotten punch out", () => {
    const r = computeDay(day({ punches: [at("08:58")], overrides: { lastOut: at("18:00") } }))!;
    expect(r).toMatchObject({ status: "present", missingOut: false, earlyMinutes: 0, isManual: true });
    expect(r.lastOut?.toISOString()).toBe(at("18:00").toISOString());
  });

  it("works out late and early from overridden times", () => {
    const r = computeDay(day({ punches: [at("08:58"), at("18:00")], overrides: { firstIn: at("09:40"), lastOut: at("17:00") } }))!;
    expect(r).toMatchObject({ status: "late", lateMinutes: 40, earlyMinutes: 60, isManual: true });
  });

  it("turns an absent day into a present one when a missed punch is added", () => {
    const r = computeDay(day({ overrides: { firstIn: at("09:00"), lastOut: at("18:00") } }))!;
    expect(r).toMatchObject({ status: "present", punchCount: 0, isManual: true });
  });

  it("lets a status override win over overridden times", () => {
    const r = computeDay(day({ overrides: { firstIn: at("09:40"), status: "present" } }))!;
    expect(r).toMatchObject({ status: "present", lateMinutes: 40, isManual: true });
  });

  it("can mark an off day as worked, or a working day as a holiday", () => {
    expect(computeDay(day({ date: FRIDAY, overrides: { firstIn: at("10:00", FRIDAY) } }))).toMatchObject({
      status: "weekly_off",
      workedOnOffDay: true,
      isManual: true,
    });
    expect(computeDay(day({ overrides: { status: "holiday" } }))?.status).toBe("holiday");
  });
});

describe("it only reads its inputs", () => {
  it("gives the same answer twice and does not change its input", () => {
    const input = day({ punches: [at("09:20"), at("08:50"), at("17:00")], overrides: { lastOut: at("17:30") } });
    const copy = structuredClone(input);
    const first = computeDay(input);
    const second = computeDay(input);
    expect(second).toEqual(first);
    expect(input.punches.map((p) => p.getTime())).toEqual(copy.punches.map((p) => p.getTime()));
    expect(input.overrides?.lastOut?.getTime()).toBe(copy.overrides?.lastOut?.getTime());
  });

  it("does not depend on the server clock or time zone", () => {
    const before = computeDay(day({ punches: [at("09:30"), at("18:00")] }));
    const original = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(computeDay(day({ punches: [at("09:30"), at("18:00")] }))).toEqual(before);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
