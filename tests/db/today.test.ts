import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceDays, employees, shifts } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { loadDayPunches, loadTodayBoard } from "@/lib/attendance/today";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// A Tuesday no other test uses.
const DAY = "2032-05-11";

describe.skipIf(!testDatabaseUrl)("today board", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  it("works out today from the punches and saves nothing", async () => {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Today ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: "Today Person", joinDate: "2032-01-01", shiftId: shift.id }).returning();
    const serial = uniqueSerial("T");
    await addTestDevice(db, serial);
    await savePunches(db, [{ deviceSn: serial, empCode: code, punchedAt: officeDateTimeToInstant(DAY, "09:30")!, statusCode: 0, verifyCode: 1, rawLine: "x" }]);

    const morning = await loadTodayBoard(db, officeDateTimeToInstant(DAY, "10:00")!);
    expect(morning.entries.find((e) => e.id === employee.id)).toMatchObject({ group: "in", status: "late", lateMinutes: 30, missingOut: true });

    const [other] = await db.insert(employees).values({ empCode: uniqueCode(), name: "Today Absent", joinDate: "2032-01-01", shiftId: shift.id }).returning();
    expect((await loadTodayBoard(db, officeDateTimeToInstant(DAY, "12:00")!)).entries.find((e) => e.id === other.id)?.group).toBe("not_in_yet");
    expect((await loadTodayBoard(db, officeDateTimeToInstant(DAY, "19:00")!)).entries.find((e) => e.id === other.id)?.group).toBe("absent");

    expect(await db.select().from(attendanceDays).where(eq(attendanceDays.employeeId, employee.id))).toEqual([]);
  });

  it("loads only the punches of the office date asked for, oldest first, with the device name", async () => {
    const serial = uniqueSerial("P");
    const code = uniqueCode();
    await addTestDevice(db, serial);
    const raw = (date: string, time: string) => ({ deviceSn: serial, empCode: code, punchedAt: officeDateTimeToInstant(date, time)!, statusCode: 0, verifyCode: 1, rawLine: `${date} ${time}` });
    // 23:50 the evening before and 00:10 the evening after sit just outside the day.
    await savePunches(db, [raw("2032-05-10", "23:50"), raw(DAY, "17:00"), raw(DAY, "08:45"), raw("2032-05-12", "00:10")]);

    const punches = (await loadDayPunches(db, DAY)).filter((p) => p.empCode === code);
    expect(punches.map((p) => p.at)).toEqual([officeDateTimeToInstant(DAY, "08:45")!, officeDateTimeToInstant(DAY, "17:00")!]);
    expect(punches[0].deviceName).toBe(`Test ${serial}`);
  });
});
