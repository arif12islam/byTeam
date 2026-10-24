import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceAdjustments, attendanceDays, companySettings, employees, holidays, shifts, users } from "@/db/schema";
import { MAX_RANGE_DAYS, recalc } from "@/lib/attendance/recalc";
import { savePunches } from "@/lib/adms/store";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// A week in 2031 that no other test touches. Monday 3 March to Sunday 9 March.
const MON = "2031-03-03";
const TUE = "2031-03-04";
const WED = "2031-03-05";
const THU = "2031-03-06";
const FRI = "2031-03-07";
const SAT = "2031-03-08";
const SUN = "2031-03-09";

function at(date: string, time: string): Date {
  return officeDateTimeToInstant(date, time)!;
}

describe.skipIf(!testDatabaseUrl)("recalc", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    // The company settings are one shared row. Friday and Saturday off, the Thursday of this week a holiday.
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    await db.insert(holidays).values({ date: THU, name: "Test holiday" }).onConflictDoNothing();
    userId = `recalc-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "hr" });
  });
  afterAll(() => close());

  /** A new employee on a 09:00 to 18:00 shift with 10 minutes grace, and a device of their own. */
  async function setup(overrides: { joinDate?: string; exitDate?: string | null; active?: boolean } = {}) {
    const code = uniqueCode();
    const [shift] = await db
      .insert(shifts)
      .values({ name: `Recalc ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 })
      .returning();
    const [employee] = await db
      .insert(employees)
      .values({
        empCode: code,
        name: "Recalc Person",
        joinDate: overrides.joinDate ?? "2031-01-01",
        exitDate: overrides.exitDate ?? null,
        active: overrides.active ?? true,
        shiftId: shift.id,
      })
      .returning();
    const serial = uniqueSerial("R");
    await addTestDevice(db, serial);

    const punch = (date: string, time: string, device = serial) => ({
      deviceSn: device,
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

  it("builds every kind of day for a week", async () => {
    const { employee, punch } = await setup();
    await savePunches(db, [
      punch(MON, "08:55"), punch(MON, "18:05"), // on time
      punch(TUE, "09:30"), punch(TUE, "17:00"), // late and early
      punch(SAT, "10:00"), punch(SAT, "14:00"), // worked on a weekly off day
      punch(SUN, "09:00"), // forgot to punch out
    ]);

    expect(await recalc(db, { employeeIds: [employee.id], from: MON, to: SUN })).toEqual({ employees: 1, days: 7, removed: 0 });
    const days = await daysOf(employee.id);

    expect(days.get(MON)).toMatchObject({ status: "present", lateMinutes: 0, earlyMinutes: 0, missingOut: false, punchCount: 2 });
    expect(days.get(TUE)).toMatchObject({ status: "late", lateMinutes: 30, earlyMinutes: 60 });
    expect(days.get(WED)).toMatchObject({ status: "absent", punchCount: 0, firstIn: null });
    expect(days.get(THU)).toMatchObject({ status: "holiday", workedOnOffDay: false });
    expect(days.get(FRI)).toMatchObject({ status: "weekly_off", workedOnOffDay: false });
    expect(days.get(SAT)).toMatchObject({ status: "weekly_off", workedOnOffDay: true, lateMinutes: 0 });
    expect(days.get(SUN)).toMatchObject({ status: "present", missingOut: true, lastOut: null });
    expect(days.get(MON)?.firstIn?.toISOString()).toBe(at(MON, "08:55").toISOString());
  });

  it("gives the same rows when it runs again, with no duplicates", async () => {
    const { employee, punch } = await setup();
    await savePunches(db, [punch(MON, "09:00"), punch(MON, "18:00"), punch(TUE, "09:40")]);

    await recalc(db, { employeeIds: [employee.id], from: MON, to: SUN });
    const first = [...(await daysOf(employee.id)).values()].map(({ computedAt, id, ...rest }) => (void computedAt, void id, rest));
    const summary = await recalc(db, { employeeIds: [employee.id], from: MON, to: SUN });
    const second = [...(await daysOf(employee.id)).values()].map(({ computedAt, id, ...rest }) => (void computedAt, void id, rest));

    expect(summary).toEqual({ employees: 1, days: 7, removed: 0 });
    expect(second).toEqual(first);
    expect(second).toHaveLength(7);
  });

  it("picks up punches that arrive later", async () => {
    const { employee, punch } = await setup();
    await recalc(db, { employeeIds: [employee.id], from: MON, to: MON });
    expect((await daysOf(employee.id)).get(MON)?.status).toBe("absent");

    await savePunches(db, [punch(MON, "09:25"), punch(MON, "18:00")]); // the device was offline and catches up
    await recalc(db, { employeeIds: [employee.id], from: MON, to: MON });
    expect((await daysOf(employee.id)).get(MON)).toMatchObject({ status: "late", lateMinutes: 25, punchCount: 2 });
  });

  it("counts punches from every device, and only the employee's own code", async () => {
    const { employee, punch } = await setup();
    const other = await setup();
    const secondDevice = uniqueSerial("R");
    await addTestDevice(db, secondDevice);
    await savePunches(db, [punch(MON, "08:50"), punch(MON, "13:00", secondDevice), other.punch(MON, "07:00"), other.punch(MON, "20:00")]);

    await recalc(db, { employeeIds: [employee.id, other.employee.id], from: MON, to: MON });
    expect((await daysOf(employee.id)).get(MON)).toMatchObject({ punchCount: 2 });
    expect((await daysOf(other.employee.id)).get(MON)).toMatchObject({ punchCount: 2 });
    expect((await daysOf(employee.id)).get(MON)?.lastOut?.toISOString()).toBe(at(MON, "13:00").toISOString());
  });

  it("puts a punch just after midnight in Dhaka on that Dhaka day", async () => {
    const { employee, punch } = await setup();
    await savePunches(db, [punch(TUE, "00:30"), punch(MON, "23:50")]);
    await recalc(db, { employeeIds: [employee.id], from: MON, to: TUE });
    const days = await daysOf(employee.id);
    expect(days.get(MON)).toMatchObject({ punchCount: 1, firstIn: at(MON, "23:50") });
    expect(days.get(TUE)).toMatchObject({ punchCount: 1, firstIn: at(TUE, "00:30") });
  });

  it("applies manual adjustments, and drops them again when cleared", async () => {
    const { employee, punch } = await setup();
    await savePunches(db, [punch(MON, "08:58")]); // forgot to punch out
    await recalc(db, { employeeIds: [employee.id], from: MON, to: WED });
    expect((await daysOf(employee.id)).get(MON)).toMatchObject({ missingOut: true, isManual: false });

    const base = { employeeId: employee.id, createdBy: userId };
    await db.insert(attendanceAdjustments).values([
      { ...base, date: MON, field: "last_out", newValue: at(MON, "18:00").toISOString(), reason: "Forgot to punch out, confirmed" },
      { ...base, date: WED, field: "status", newValue: "present", reason: "Was at a client site" },
    ]);
    await recalc(db, { employeeIds: [employee.id], from: MON, to: WED });
    let days = await daysOf(employee.id);
    expect(days.get(MON)).toMatchObject({ missingOut: false, isManual: true, status: "present", earlyMinutes: 0 });
    expect(days.get(MON)?.lastOut?.toISOString()).toBe(at(MON, "18:00").toISOString());
    expect(days.get(WED)).toMatchObject({ status: "present", isManual: true });

    await db.insert(attendanceAdjustments).values({ ...base, date: WED, field: "status", newValue: null, reason: "Mistake, was absent" });
    await recalc(db, { employeeIds: [employee.id], from: MON, to: WED });
    days = await daysOf(employee.id);
    expect(days.get(WED)).toMatchObject({ status: "absent", isManual: false });
    expect(days.get(MON)?.isManual).toBe(true);
  });

  it("has no rows before the join date or after the exit date, and removes rows when those dates move", async () => {
    const { employee } = await setup({ joinDate: TUE, exitDate: THU });
    expect(await recalc(db, { employeeIds: [employee.id], from: MON, to: SUN })).toEqual({ employees: 1, days: 3, removed: 0 });
    expect([...(await daysOf(employee.id)).keys()].sort()).toEqual([TUE, WED, THU]);

    await db.update(employees).set({ joinDate: WED }).where(eq(employees.id, employee.id));
    expect(await recalc(db, { employeeIds: [employee.id], from: MON, to: SUN })).toEqual({ employees: 1, days: 2, removed: 1 });
    expect([...(await daysOf(employee.id)).keys()].sort()).toEqual([WED, THU]);
  });

  it("recomputes only active employees unless some are named", async () => {
    // Recalculating "everyone" writes rows for every active employee in the database, including ones other test
    // files are using at the same time. A Monday that no other test looks at keeps them apart.
    const alone = "2031-03-17";
    const left = await setup({ active: false });
    await recalc(db, { employeeIds: null, from: alone, to: alone });
    expect((await daysOf(left.employee.id)).size).toBe(0);

    await recalc(db, { employeeIds: [left.employee.id], from: alone, to: alone });
    expect((await daysOf(left.employee.id)).size).toBe(1);
  });

  it("changes only the dates and employees it was asked about", async () => {
    const a = await setup();
    const b = await setup();
    await recalc(db, { employeeIds: [a.employee.id, b.employee.id], from: MON, to: WED });
    const before = await daysOf(b.employee.id);

    await savePunches(db, [a.punch(MON, "09:00"), b.punch(MON, "09:00")]);
    await recalc(db, { employeeIds: [a.employee.id], from: MON, to: MON });

    expect((await daysOf(a.employee.id)).get(MON)?.status).toBe("present");
    expect((await daysOf(b.employee.id)).get(MON)).toEqual(before.get(MON)); // still absent: not asked
    expect((await daysOf(a.employee.id)).get(TUE)?.status).toBe("absent");
  });

  it("does nothing for an empty range or no employees, and refuses a huge range", async () => {
    const { employee } = await setup();
    expect(await recalc(db, { employeeIds: [employee.id], from: TUE, to: MON })).toEqual({ employees: 0, days: 0, removed: 0 });
    expect(await recalc(db, { employeeIds: [], from: MON, to: MON })).toEqual({ employees: 0, days: 0, removed: 0 });
    await expect(recalc(db, { employeeIds: [employee.id], from: "2031-01-01", to: "2032-12-31" })).rejects.toThrow(
      new RegExp(String(MAX_RANGE_DAYS)),
    );
    expect((await daysOf(employee.id)).size).toBe(0);
  });
});
