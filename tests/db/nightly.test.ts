import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceDays, employees, shifts } from "@/db/schema";
import { runNightlyRecalc } from "@/lib/attendance/nightly";
import { officeDateTimeToInstant } from "@/lib/time";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

describe.skipIf(!testDatabaseUrl)("nightly recalculation", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  it("rebuilds the previous office day, even when the server clock is still on the old UTC date", async () => {
    // 01:30 on 15 April 2032 in Dhaka is still 14 April in UTC. The job covers 14 April Dhaka time.
    const now = officeDateTimeToInstant("2032-04-15", "01:30")!;
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Nightly ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    const [employee] = await db
      .insert(employees)
      .values({ empCode: code, name: "Nightly Person", joinDate: "2032-01-01", shiftId: shift.id })
      .returning();

    const result = await runNightlyRecalc(db, now);
    expect(result.date).toBe("2032-04-14");
    expect(result.days).toBeGreaterThanOrEqual(1);

    const rows = await db.select().from(attendanceDays).where(eq(attendanceDays.employeeId, employee.id));
    expect(rows.map((r) => r.date)).toEqual(["2032-04-14"]);
  });
});
