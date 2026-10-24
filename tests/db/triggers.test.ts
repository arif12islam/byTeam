import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { attendanceAdjustments, attendanceDays, auditLog, employees, shifts, users } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { addAdjustment } from "@/lib/attendance/adjustments";
import { recalc } from "@/lib/attendance/recalc";
import {
  recalcAfterEmployeeChange,
  recalcAfterHolidayChange,
  recalcAfterShiftChange,
  recalcForNewPunches,
} from "@/lib/attendance/triggers";
import { updateEmployee } from "@/lib/employees/employees";
import { updateShift } from "@/lib/shifts/shifts";
import { officeDateTimeToInstant, toOfficeDate } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// Monday 3 March 2031 to Sunday 9 March 2031: dates no other test uses.
const MON = "2031-03-03";
const TUE = "2031-03-04";
const WED = "2031-03-05";
const THU = "2031-03-06";
const SUN = "2031-03-09";
const AFTER = "2031-03-20"; // a "today" after the whole week

const at = (date: string, time: string) => officeDateTimeToInstant(date, time)!;

describe.skipIf(!testDatabaseUrl)("recalculation triggers", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    userId = `trigger-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "hr" });
  });
  afterAll(() => close());

  async function setup(opts: { joinDate?: string; exitDate?: string | null; grace?: number } = {}) {
    const code = uniqueCode();
    const [shift] = await db
      .insert(shifts)
      .values({ name: `Trig ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: opts.grace ?? 10 })
      .returning();
    const [employee] = await db
      .insert(employees)
      .values({ empCode: code, name: "Trigger Person", joinDate: opts.joinDate ?? "2031-01-01", exitDate: opts.exitDate ?? null, shiftId: shift.id })
      .returning();
    const serial = uniqueSerial("T");
    await addTestDevice(db, serial);
    const punch = (date: string, time: string) => ({
      deviceSn: serial,
      empCode: code,
      punchedAt: at(date, time),
      statusCode: 0,
      verifyCode: 1,
      rawLine: `${code} ${date} ${time}`,
    });
    return { code, employee, shift, serial, punch };
  }

  async function daysOf(employeeId: string) {
    const rows = await db.select().from(attendanceDays).where(eq(attendanceDays.employeeId, employeeId)).orderBy(asc(attendanceDays.date));
    return new Map(rows.map((r) => [r.date, r]));
  }

  describe("new punches", () => {
    it("recomputes the days the new punches fall on, and no others", async () => {
      const { employee, punch } = await setup();
      const { newPunches } = await savePunches(db, [punch(MON, "09:30"), punch(WED, "08:55"), punch(WED, "18:00")]);
      await recalcForNewPunches(db, newPunches);

      const days = await daysOf(employee.id);
      expect([...days.keys()].sort()).toEqual([MON, TUE, WED]); // the span from the first to the last new punch
      expect(days.get(MON)).toMatchObject({ status: "late", lateMinutes: 30 });
      expect(days.get(TUE)?.status).toBe("absent");
      expect(days.get(WED)).toMatchObject({ status: "present", punchCount: 2 });
    });

    it("covers a device catching up with several days and several employees in one batch", async () => {
      const a = await setup();
      const b = await setup();
      const { newPunches } = await savePunches(db, [a.punch(MON, "09:00"), b.punch(TUE, "09:00"), a.punch(THU, "09:45"), b.punch(THU, "10:00")]);
      await recalcForNewPunches(db, newPunches);
      expect([...(await daysOf(a.employee.id)).keys()].sort()).toEqual([MON, TUE, WED, THU]);
      expect([...(await daysOf(b.employee.id)).keys()].sort()).toEqual([MON, TUE, WED, THU]);
    });

    it("ignores codes nobody has, and does nothing for an empty list", async () => {
      const { employee } = await setup();
      await recalcForNewPunches(db, [{ empCode: uniqueCode(), punchedAt: at(MON, "09:00") }]);
      await recalcForNewPunches(db, []);
      expect((await daysOf(employee.id)).size).toBe(0);
    });

    it("does nothing for a resent batch, because no punch is new", async () => {
      const { employee, punch } = await setup();
      const batch = [punch(MON, "09:00"), punch(MON, "18:00")];
      await recalcForNewPunches(db, (await savePunches(db, batch)).newPunches);
      const [first] = [...(await daysOf(employee.id)).values()];

      const resent = await savePunches(db, batch);
      expect(resent.newPunches).toEqual([]);
      await recalcForNewPunches(db, resent.newPunches);
      const [second] = [...(await daysOf(employee.id)).values()];
      expect(second.computedAt.getTime()).toBe(first.computedAt.getTime());
    });

    it("never throws, even when the recalculation fails, so the punch upload still succeeds", async () => {
      const broken = { select: () => { throw new Error("the database went away"); } } as unknown as TestDb;
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(recalcForNewPunches(broken, [{ empCode: "1001", punchedAt: new Date() }])).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledOnce();
      expect(String(log.mock.calls[0][0])).toMatch(/nightly job will catch up/);
      log.mockRestore();
    });
  });

  describe("shift changes", () => {
    it("recomputes today for the people on that shift, and not for others", async () => {
      const onShift = await setup({ grace: 10 });
      const other = await setup({ grace: 10 });
      await savePunches(db, [onShift.punch(MON, "09:15"), other.punch(MON, "09:15")]);
      await recalc(db, { employeeIds: [onShift.employee.id, other.employee.id], from: MON, to: MON });
      expect((await daysOf(onShift.employee.id)).get(MON)?.status).toBe("late");

      await db.update(shifts).set({ graceMinutes: 20 }).where(eq(shifts.id, onShift.shift.id));
      await recalcAfterShiftChange(db, onShift.shift.id, MON);

      expect((await daysOf(onShift.employee.id)).get(MON)?.status).toBe("present"); // 09:15 is within the new grace
      expect((await daysOf(other.employee.id)).get(MON)?.status).toBe("late"); // untouched
    });

    it("leaves earlier days as they were computed", async () => {
      const { employee, shift, punch } = await setup({ grace: 10 });
      await savePunches(db, [punch(MON, "09:15"), punch(TUE, "09:15")]);
      await recalc(db, { employeeIds: [employee.id], from: MON, to: TUE });
      await db.update(shifts).set({ graceMinutes: 20 }).where(eq(shifts.id, shift.id));
      await recalcAfterShiftChange(db, shift.id, TUE);
      const days = await daysOf(employee.id);
      expect(days.get(MON)?.status).toBe("late"); // history is not rewritten
      expect(days.get(TUE)?.status).toBe("present");
    });

    it("runs when a shift's hours are saved, and not when only its name changes", async () => {
      const today = toOfficeDate(new Date());
      const { employee, shift } = await setup({ joinDate: "2020-01-01" });

      await updateShift(db, shift.id, { name: `Renamed ${shift.name}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }, userId);
      expect((await daysOf(employee.id)).get(today)).toBeUndefined();

      await updateShift(db, shift.id, { name: `Renamed ${shift.name}`, startTime: "09:00", endTime: "18:00", graceMinutes: 15 }, userId);
      expect((await daysOf(employee.id)).get(today)).toBeDefined();
    });
  });

  describe("employee changes", () => {
    it("adds days when the join date moves earlier and removes them when the exit date is set", async () => {
      const { employee } = await setup({ joinDate: WED });
      await recalc(db, { employeeIds: [employee.id], from: MON, to: SUN });
      expect([...(await daysOf(employee.id)).keys()].sort()).toEqual([WED, THU, "2031-03-07", "2031-03-08", SUN]);

      const before = { shiftId: employee.shiftId, joinDate: WED, exitDate: null };
      await db.update(employees).set({ joinDate: MON }).where(eq(employees.id, employee.id));
      await recalcAfterEmployeeChange(db, employee.id, before, { ...before, joinDate: MON }, SUN);
      expect([...(await daysOf(employee.id)).keys()].sort()).toContain(MON);
      expect((await daysOf(employee.id)).get(TUE)?.status).toBe("absent");

      await db.update(employees).set({ exitDate: WED }).where(eq(employees.id, employee.id));
      await recalcAfterEmployeeChange(db, employee.id, { ...before, joinDate: MON }, { ...before, joinDate: MON, exitDate: WED }, SUN);
      expect([...(await daysOf(employee.id)).keys()].sort()).toEqual([MON, TUE, WED]);
    });

    it("does nothing when neither the shift nor the dates changed", async () => {
      const { employee } = await setup();
      const same = { shiftId: employee.shiftId, joinDate: employee.joinDate, exitDate: employee.exitDate };
      await recalcAfterEmployeeChange(db, employee.id, same, { ...same }, SUN);
      expect((await daysOf(employee.id)).size).toBe(0);
    });

    it("runs when an employee is saved with a new shift", async () => {
      const today = toOfficeDate(new Date());
      const { employee } = await setup({ joinDate: "2020-01-01" });
      const [other] = await db.insert(shifts).values({ name: `Other ${employee.empCode}`, startTime: "10:00", endTime: "19:00" }).returning();
      await updateEmployee(db, employee.id, { name: employee.name, joinDate: "2020-01-01", shiftId: other.id }, userId);
      expect((await daysOf(employee.id)).get(today)).toBeDefined();
    });
  });

  describe("holidays", () => {
    it("recomputes that one date for active employees, and ignores a date that has not come yet", async () => {
      // A date no other test uses, because holidays are shared by every test file; removed again at the end.
      const eve = "2031-03-11";
      const holiday = "2031-03-12";
      const { employee } = await setup();
      const { holidays } = await import("@/db/schema");
      await recalc(db, { employeeIds: [employee.id], from: eve, to: holiday });

      try {
        await recalcAfterHolidayChange(db, holiday, eve); // the holiday is tomorrow: nothing to do yet
        expect((await daysOf(employee.id)).get(holiday)?.status).toBe("absent");

        // Make the day a holiday the same way the Settings screen does, then run the trigger as of that evening.
        await db.insert(holidays).values({ date: holiday, name: "Trigger test holiday" }).onConflictDoNothing();
        await recalcAfterHolidayChange(db, holiday, holiday);
        const days = await daysOf(employee.id);
        expect(days.get(holiday)?.status).toBe("holiday");
        expect(days.get(eve)?.status).toBe("absent");
      } finally {
        await db.delete(holidays).where(eq(holidays.date, holiday));
      }
    });
  });
});

describe.skipIf(!testDatabaseUrl)("manual adjustments", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    userId = `adjust-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "hr" });
  });
  afterAll(() => close());

  async function setup(opts: { joinDate?: string; exitDate?: string | null } = {}) {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Adj ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db
      .insert(employees)
      .values({ empCode: code, name: "Adjust Person", joinDate: opts.joinDate ?? "2031-01-01", exitDate: opts.exitDate ?? null, shiftId: shift.id })
      .returning();
    const serial = uniqueSerial("A");
    await addTestDevice(db, serial);
    return { code, employee, serial };
  }

  const day = async (employeeId: string, date: string) =>
    (await db.select().from(attendanceDays).where(and(eq(attendanceDays.employeeId, employeeId), eq(attendanceDays.date, date))))[0];

  it("saves a status change with its reason, recomputes the day and writes an audit row", async () => {
    const { employee } = await setup();
    const result = await addAdjustment(
      db,
      { employeeId: employee.id, date: MON, field: "status", value: "present", reason: "At a client site, confirmed by the manager" },
      userId,
      AFTER,
    );
    expect(result).toEqual({ ok: true });
    expect(await day(employee.id, MON)).toMatchObject({ status: "present", isManual: true });

    const [row] = await db.select().from(attendanceAdjustments).where(eq(attendanceAdjustments.employeeId, employee.id));
    expect(row).toMatchObject({ field: "status", newValue: "present", createdBy: userId, reason: "At a client site, confirmed by the manager" });

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, `${employee.id}:${MON}`));
    expect(entry).toMatchObject({ action: "attendance.adjust", actorId: userId, entity: "attendance_day" });
    expect(entry.after).toMatchObject({ field: "status", newValue: "present" });
  });

  it("turns a clock time on that date into the exact instant, and fixes a forgotten punch out", async () => {
    const { employee, serial, code } = await setup();
    await savePunches(db, [{ deviceSn: serial, empCode: code, punchedAt: at(MON, "08:58"), statusCode: 0, verifyCode: 1, rawLine: "x" }]);
    await recalc(db, { employeeIds: [employee.id], from: MON, to: MON });
    expect(await day(employee.id, MON)).toMatchObject({ missingOut: true });

    expect(await addAdjustment(db, { employeeId: employee.id, date: MON, field: "last_out", value: "18:05", reason: "Forgot to punch out" }, userId, AFTER)).toEqual({ ok: true });
    const fixed = await day(employee.id, MON);
    expect(fixed).toMatchObject({ missingOut: false, isManual: true, status: "present" });
    expect(fixed.lastOut?.toISOString()).toBe(at(MON, "18:05").toISOString());
  });

  it("removes an earlier change when the value is empty", async () => {
    const { employee } = await setup();
    await addAdjustment(db, { employeeId: employee.id, date: TUE, field: "status", value: "present", reason: "First entry" }, userId, AFTER);
    expect((await day(employee.id, TUE)).status).toBe("present");
    expect(await addAdjustment(db, { employeeId: employee.id, date: TUE, field: "status", value: "", reason: "That was a mistake" }, userId, AFTER)).toEqual({ ok: true });
    expect(await day(employee.id, TUE)).toMatchObject({ status: "absent", isManual: false });
    const history = await db.select().from(attendanceAdjustments).where(eq(attendanceAdjustments.employeeId, employee.id));
    expect(history).toHaveLength(2); // nothing was removed, only superseded
  });

  it("refuses a missing or blank reason and writes nothing", async () => {
    const { employee } = await setup();
    for (const reason of ["", "   ", "\n\t", "ab"]) {
      const result = await addAdjustment(db, { employeeId: employee.id, date: MON, field: "status", value: "present", reason }, userId, AFTER);
      expect(result.ok, JSON.stringify(reason)).toBe(false);
    }
    expect(await db.select().from(attendanceAdjustments).where(eq(attendanceAdjustments.employeeId, employee.id))).toHaveLength(0);
  });

  it("refuses a day that has not happened yet, and a date outside the person's employment", async () => {
    const { employee } = await setup({ joinDate: TUE, exitDate: THU });
    const base = { employeeId: employee.id, field: "status" as const, value: "present", reason: "A good reason" };
    expect(await addAdjustment(db, { ...base, date: THU }, userId, WED)).toEqual({ ok: false, error: "That day has not happened yet." });
    expect((await addAdjustment(db, { ...base, date: MON }, userId, AFTER)).ok).toBe(false); // before joining
    expect((await addAdjustment(db, { ...base, date: SUN }, userId, AFTER)).ok).toBe(false); // after leaving
    expect((await addAdjustment(db, { ...base, date: WED }, userId, AFTER)).ok).toBe(true);
  });

  it("refuses an unknown employee, a bad status, a bad time and a bad date", async () => {
    const { employee } = await setup();
    const base = { employeeId: employee.id, date: MON, reason: "A good reason" };
    expect((await addAdjustment(db, { ...base, employeeId: crypto.randomUUID(), field: "status", value: "present" }, userId, AFTER)).ok).toBe(false);
    expect((await addAdjustment(db, { ...base, field: "status", value: "on_the_moon" }, userId, AFTER)).ok).toBe(false);
    expect((await addAdjustment(db, { ...base, field: "first_in", value: "9am" }, userId, AFTER)).ok).toBe(false);
    expect((await addAdjustment(db, { ...base, field: "first_in", value: "25:00" }, userId, AFTER)).ok).toBe(false);
    expect((await addAdjustment(db, { ...base, date: "2031-02-30", field: "status", value: "present" }, userId, AFTER)).ok).toBe(false);
    expect((await addAdjustment(db, { ...base, field: "salary" as never, value: "1" }, userId, AFTER)).ok).toBe(false);
  });

  it("refuses a leaving time that is not after the arrival, and an arrival after the leaving time", async () => {
    const { employee, serial, code } = await setup();
    await savePunches(db, [
      { deviceSn: serial, empCode: code, punchedAt: at(MON, "09:00"), statusCode: 0, verifyCode: 1, rawLine: "x" },
      { deviceSn: serial, empCode: code, punchedAt: at(MON, "17:00"), statusCode: 1, verifyCode: 1, rawLine: "y" },
    ]);
    await recalc(db, { employeeIds: [employee.id], from: MON, to: MON });
    const base = { employeeId: employee.id, date: MON, reason: "A good reason" };

    expect(await addAdjustment(db, { ...base, field: "last_out", value: "08:30" }, userId, AFTER)).toEqual({ ok: false, error: "The leaving time must be after the arrival time." });
    expect((await addAdjustment(db, { ...base, field: "last_out", value: "09:00" }, userId, AFTER)).ok).toBe(false);
    expect(await addAdjustment(db, { ...base, field: "first_in", value: "17:30" }, userId, AFTER)).toEqual({ ok: false, error: "The arrival time must be before the leaving time." });
    expect((await addAdjustment(db, { ...base, field: "last_out", value: "18:10" }, userId, AFTER)).ok).toBe(true);
  });
});
