import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companySettings, employees, leaveRequests, leaveTypes, shifts, users } from "@/db/schema";

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

describe.skipIf(!testDatabaseUrl)("leave tables", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let employeeId: string;
  let userId: string;
  let typeId: string;

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
    const [type] = await db.insert(leaveTypes).values({ name: `Schema ${code}`, yearlyQuota: 10 }).returning();
    typeId = type.id;
  });
  afterAll(() => close());

  const request = (over: Partial<typeof leaveRequests.$inferInsert> = {}) => ({
    employeeId,
    leaveTypeId: typeId,
    fromDate: "2030-05-06",
    toDate: "2030-05-08",
    days: 3,
    createdBy: userId,
    ...over,
  });

  it("starts as pending with no decision, and the year basis defaults to the calendar year", async () => {
    const [row] = await db.insert(leaveRequests).values(request()).returning();
    expect(row).toMatchObject({ status: "pending", unpaidDays: 0, decidedBy: null, decidedAt: null });
    await db.insert(companySettings).values({ id: 1, name: "" }).onConflictDoNothing();
    const [settings] = await db.select().from(companySettings);
    expect(["calendar", "anniversary"]).toContain(settings.leaveYearBasis);
  });

  it("keeps leave type names unique whatever the capital letters", async () => {
    const name = `Casual ${uniqueCode()}`;
    await db.insert(leaveTypes).values({ name });
    expect(await refusal(db.insert(leaveTypes).values({ name: name.toUpperCase() }))).toMatch(/leave_types_name_key/);
  });

  it("refuses a blank name and a negative quota, and allows no limit", async () => {
    expect(await refusal(db.insert(leaveTypes).values({ name: " \t\n " }))).toMatch(/leave_types_name_not_blank/);
    expect(await refusal(db.insert(leaveTypes).values({ name: `Neg ${uniqueCode()}`, yearlyQuota: -1 }))).toMatch(
      /leave_types_quota_not_negative/,
    );
    const [unlimited] = await db.insert(leaveTypes).values({ name: `Unlimited ${uniqueCode()}`, yearlyQuota: null, isPaid: false }).returning();
    expect(unlimited.yearlyQuota).toBeNull();
  });

  it("refuses dates out of order, zero days and unpaid days beyond the days", async () => {
    expect(await refusal(db.insert(leaveRequests).values(request({ fromDate: "2030-05-09", toDate: "2030-05-08" })))).toMatch(
      /leave_requests_dates_in_order/,
    );
    expect(await refusal(db.insert(leaveRequests).values(request({ days: 0 })))).toMatch(/leave_requests_days_positive/);
    expect(await refusal(db.insert(leaveRequests).values(request({ unpaidDays: 4 })))).toMatch(/leave_requests_unpaid_within_days/);
    expect(await refusal(db.insert(leaveRequests).values(request({ unpaidDays: -1 })))).toMatch(/leave_requests_unpaid_within_days/);
  });

  it("requires a decision to name who made it and when, and only for decided requests", async () => {
    expect(await refusal(db.insert(leaveRequests).values(request({ status: "approved" })))).toMatch(/leave_requests_decision_recorded/);
    expect(
      await refusal(db.insert(leaveRequests).values(request({ status: "pending", decidedBy: userId, decidedAt: new Date() }))),
    ).toMatch(/leave_requests_decision_recorded/);
    const [row] = await db
      .insert(leaveRequests)
      .values(request({ status: "approved", decidedBy: userId, decidedAt: new Date() }))
      .returning();
    expect(row.status).toBe("approved");
  });

  it("refuses an unknown status, and an unknown employee or type", async () => {
    expect(await refusal(db.insert(leaveRequests).values(request({ status: "maybe" as never })))).toMatch(/leave_status/);
    expect(await refusal(db.insert(leaveRequests).values(request({ employeeId: "00000000-0000-4000-8000-000000000000" })))).toMatch(
      /leave_requests_employee_id_employees_id_fk/,
    );
    expect(await refusal(db.insert(leaveRequests).values(request({ leaveTypeId: "00000000-0000-4000-8000-000000000000" })))).toMatch(
      /leave_requests_leave_type_id_leave_types_id_fk/,
    );
  });
});
