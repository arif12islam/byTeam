import { and, between, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceDays, auditLog, companySettings, employees, officeOutages, payrollRuns, shifts, users } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { createOutage, listRecentOutages, removeOutage } from "@/lib/attendance/outages";
import { recalc } from "@/lib/attendance/recalc";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// April 2019 starts on a Monday. Nothing else in the tests uses 2019.
const WHOLE_DAY = "2019-04-02"; // a Tuesday
const MORNING = "2019-04-03"; // a Wednesday
const LATER = "2019-04-30";

describe.skipIf(!testDatabaseUrl)("office outages", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;
  let a: { id: string; code: string };
  let b: { id: string; code: string };
  const serial = uniqueSerial("O");

  async function person(name: string) {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Outage ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `${name} ${code}`, joinDate: "2018-01-01", shiftId: shift.id }).returning();
    return { id: employee.id, code };
  }
  const punch = (code: string, date: string, time: string) => ({
    deviceSn: serial,
    empCode: code,
    punchedAt: officeDateTimeToInstant(date, time)!,
    statusCode: 0,
    verifyCode: 1,
    rawLine: `${code} ${date} ${time}`,
  });
  const statusOn = async (employeeId: string, date: string) =>
    (await db.select({ s: attendanceDays.status, late: attendanceDays.lateMinutes }).from(attendanceDays).where(and(eq(attendanceDays.employeeId, employeeId), eq(attendanceDays.date, date))))[0];

  beforeAll(async () => {
    ({ db, close } = connect());
    userId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Outage tester", email: `${userId}@example.test`, role: "hr" });
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    // Outages stay in the database between runs, and this file owns these months.
    await db.delete(officeOutages).where(between(officeOutages.date, "2019-04-01", "2019-06-30"));
    await addTestDevice(db, serial);

    // A arrives at 10:05 on both days, B never comes.
    a = await person("Arrives late");
    b = await person("Absent");
    await savePunches(db, [punch(a.code, WHOLE_DAY, "10:05"), punch(a.code, WHOLE_DAY, "17:00"), punch(a.code, MORNING, "10:05"), punch(a.code, MORNING, "17:00")]);
    await recalc(db, { employeeIds: [a.id, b.id], from: WHOLE_DAY, to: MORNING });
  });
  afterAll(() => close());

  it("starts with A late and B absent on both days, before any outage", async () => {
    expect(await statusOn(a.id, WHOLE_DAY)).toMatchObject({ s: "late", late: 65 });
    expect(await statusOn(b.id, WHOLE_DAY)).toMatchObject({ s: "absent" });
    expect(await statusOn(a.id, MORNING)).toMatchObject({ s: "late" });
  });

  it("an outage over the whole workday lifts both the late and the absent marks for everyone, with one audit row", async () => {
    const result = await createOutage(db, { date: WHOLE_DAY, startTime: "08:00", endTime: "19:00", reason: "Power cut all day" }, userId, "2019-04-10");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await statusOn(a.id, WHOLE_DAY)).toMatchObject({ s: "present", late: 0 });
    expect(await statusOn(b.id, WHOLE_DAY)).toMatchObject({ s: "present" });

    const trail = await db.select().from(auditLog).where(eq(auditLog.entityId, result.id));
    expect(trail.map((t) => t.action)).toEqual(["outage.create"]);
    expect(trail[0].actorId).toBe(userId);
    expect(trail[0].after).toMatchObject({ date: WHOLE_DAY, reason: "Power cut all day" });
  });

  it("a morning outage excuses the late arrival but not an absence", async () => {
    const result = await createOutage(db, { date: MORNING, startTime: "08:30", endTime: "10:00", reason: "Device was off" }, userId, "2019-04-10");
    expect(result.ok).toBe(true);
    expect(await statusOn(a.id, MORNING)).toMatchObject({ s: "present", late: 0 });
    expect(await statusOn(b.id, MORNING)).toMatchObject({ s: "absent" });
  });

  it("only touches the day of the outage", async () => {
    // A had no row for other days at all.
    expect(await statusOn(a.id, "2019-04-04")).toBeUndefined();
  });

  it("lists recent outages, newest first, with times as HH:MM", async () => {
    const list = await listRecentOutages(db, "2019-04-10");
    const mine = list.filter((o) => [WHOLE_DAY, MORNING].includes(o.date) && o.reason !== "x");
    expect(mine.map((o) => [o.date, o.startTime, o.endTime])).toEqual(
      expect.arrayContaining([
        [MORNING, "08:30", "10:00"],
        [WHOLE_DAY, "08:00", "19:00"],
      ]),
    );
    expect(list.findIndex((o) => o.date === MORNING)).toBeLessThan(list.findIndex((o) => o.date === WHOLE_DAY));
    // Far outside the window.
    expect((await listRecentOutages(db, "2020-01-01")).some((o) => o.date === WHOLE_DAY)).toBe(false);
  });

  it("removing an outage brings the marks back, with one audit row", async () => {
    const [outage] = await db.select().from(officeOutages).where(eq(officeOutages.date, WHOLE_DAY));
    expect(await removeOutage(db, outage.id, userId, "2019-04-10")).toEqual({ ok: true });

    expect(await statusOn(a.id, WHOLE_DAY)).toMatchObject({ s: "late", late: 65 });
    expect(await statusOn(b.id, WHOLE_DAY)).toMatchObject({ s: "absent" });

    const trail = await db.select().from(auditLog).where(eq(auditLog.entityId, outage.id));
    expect(trail.map((t) => t.action).sort()).toEqual(["outage.create", "outage.delete"]);
    expect(await removeOutage(db, outage.id, userId, "2019-04-10")).toMatchObject({ ok: false, error: expect.stringContaining("already removed") });
  });

  it("refuses bad input and saves nothing", async () => {
    const base = { date: LATER, startTime: "09:00", endTime: "10:00", reason: "Power cut" };
    for (const [over, message] of [
      [{ date: "" }, "Enter the date"],
      [{ date: "2019-02-30" }, "Enter the date"],
      [{ startTime: "nine" }, "started"],
      [{ endTime: "" }, "ended"],
      [{ endTime: "09:00" }, "end after it started"],
      [{ startTime: "11:00", endTime: "10:00" }, "end after it started"],
      [{ reason: "  " }, "Say what happened"],
      [{ reason: "x".repeat(201) }, "under 200"],
    ] as const) {
      expect(await createOutage(db, { ...base, ...over }, userId, "2019-05-01"), JSON.stringify(over)).toEqual({ ok: false, error: expect.stringContaining(message) });
    }
    expect(await db.select().from(officeOutages).where(eq(officeOutages.date, LATER))).toHaveLength(0);
  });

  it("refuses a day in a month whose payroll is finalized, for adding and for removing", async () => {
    const date = "2019-06-04";
    const first = "2019-06-01";
    await db.delete(payrollRuns).where(eq(payrollRuns.month, first));
    const [open] = await db.insert(officeOutages).values({ date, startTime: "09:00", endTime: "10:00", reason: "Before finalizing", createdBy: userId }).returning();
    await db.insert(payrollRuns).values({ month: first, status: "finalized", ruleSetSnapshot: { test: true }, createdBy: userId, finalizedBy: userId, finalizedAt: new Date() });
    try {
      expect(await createOutage(db, { date, startTime: "11:00", endTime: "12:00", reason: "Another cut" }, userId, "2019-07-10")).toEqual({
        ok: false,
        error: "Payroll for Jun 2019 is finalized, so attendance for that day cannot be changed. Ask the owner to unlock the month first.",
      });
      expect(await removeOutage(db, open.id, userId, "2019-07-10")).toMatchObject({ ok: false, error: expect.stringContaining("finalized") });
      expect(await db.select().from(officeOutages).where(eq(officeOutages.date, date))).toHaveLength(1);
    } finally {
      await db.delete(payrollRuns).where(eq(payrollRuns.month, first));
      await db.delete(officeOutages).where(eq(officeOutages.date, date));
    }
  });
});
