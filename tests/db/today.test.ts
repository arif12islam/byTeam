import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceDays, employees, shifts } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { loadTodayBoard } from "@/lib/attendance/today";
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
});
