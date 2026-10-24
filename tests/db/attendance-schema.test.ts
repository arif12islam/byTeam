import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceAdjustments, attendanceDays, employees, shifts, users } from "@/db/schema";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

/** Drizzle wraps the database's message, so read the whole error chain. */
async function refusal(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause) messages.push(e.message);
    return messages.join(" | ");
  }
  return "";
}

describe.skipIf(!testDatabaseUrl)("attendance tables", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let employeeId: string;
  let userId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Test ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    const [employee] = await db
      .insert(employees)
      .values({ empCode: code, name: "Test Person", joinDate: "2026-01-01", shiftId: shift.id })
      .returning();
    employeeId = employee.id;
    userId = `test-user-${code}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "hr" });
  });
  afterAll(() => close());

  it("keeps one row per employee per day", async () => {
    await db.insert(attendanceDays).values({ employeeId, date: "2026-10-01", status: "present" });
    expect(await refusal(db.insert(attendanceDays).values({ employeeId, date: "2026-10-01", status: "late" }))).toMatch(
      /attendance_days_employee_date_key/,
    );
    await db.insert(attendanceDays).values({ employeeId, date: "2026-10-02", status: "late" });
  });

  it("refuses an unknown status and negative minutes", async () => {
    expect(
      await refusal(db.insert(attendanceDays).values({ employeeId, date: "2026-10-03", status: "on_holiday" as never })),
    ).toMatch(/invalid input value for enum/);
    expect(
      await refusal(db.insert(attendanceDays).values({ employeeId, date: "2026-10-04", status: "late", lateMinutes: -5 })),
    ).toMatch(/attendance_days_minutes_not_negative/);
  });

  it("starts a day with sensible defaults", async () => {
    await db.insert(attendanceDays).values({ employeeId, date: "2026-10-05", status: "absent" });
    const [row] = await db.select().from(attendanceDays).where(eq(attendanceDays.date, "2026-10-05"));
    expect(row).toMatchObject({
      firstIn: null,
      lastOut: null,
      lateMinutes: 0,
      earlyMinutes: 0,
      missingOut: false,
      workedOnOffDay: false,
      punchCount: 0,
      isManual: false,
    });
  });

  it("needs a real reason for an adjustment", async () => {
    const base = { employeeId, date: "2026-10-06", field: "status" as const, newValue: "present", createdBy: userId };
    for (const reason of ["", "   ", "\n\t"]) {
      expect(await refusal(db.insert(attendanceAdjustments).values({ ...base, reason })), JSON.stringify(reason)).toMatch(
        /attendance_adjustments_reason_not_blank/,
      );
    }
    await db.insert(attendanceAdjustments).values({ ...base, reason: "Forgot to punch, confirmed by manager" });
  });

  it("keeps every adjustment, so the history is never lost, and allows clearing with no value", async () => {
    const base = { employeeId, date: "2026-10-07", field: "last_out" as const, createdBy: userId };
    await db.insert(attendanceAdjustments).values({ ...base, newValue: "2026-10-07T12:00:00Z", reason: "First fix" });
    await db.insert(attendanceAdjustments).values({ ...base, newValue: "2026-10-07T12:30:00Z", reason: "Corrected the fix" });
    await db.insert(attendanceAdjustments).values({ ...base, newValue: null, reason: "Put it back" });
    const rows = await db.select().from(attendanceAdjustments).where(eq(attendanceAdjustments.date, "2026-10-07"));
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.newValue === null)).toHaveLength(1);
  });

  it("refuses an unknown adjustment field", async () => {
    expect(
      await refusal(
        db.insert(attendanceAdjustments).values({
          employeeId,
          date: "2026-10-08",
          field: "salary" as never,
          newValue: "1",
          reason: "nope",
          createdBy: userId,
        }),
      ),
    ).toMatch(/invalid input value for enum/);
  });

  it("will not let an employee with attendance history be deleted", async () => {
    expect(await refusal(db.delete(employees).where(eq(employees.id, employeeId)))).toMatch(/foreign key/);
  });
});
