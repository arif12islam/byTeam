import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companySettings, employees, leaveRequests, leaveTypes, shifts, users } from "@/db/schema";
import { loadBalances } from "@/lib/leave/balances";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

// Everyone here joins on 1 January 2036 and the date asked about is in 2036, so the leave year is the same
// whichever way the shared setting is set (calendar year, or from the joining date). October 2036: Wednesday
// the 1st, Friday and Saturday off.
const TODAY = "2036-10-24";

describe.skipIf(!testDatabaseUrl)("loading leave balances", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;
  let casualId: string;
  let sickId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    userId = `balance-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "hr" });
    const [casual] = await db.insert(leaveTypes).values({ name: `Casual ${uniqueCode()}`, yearlyQuota: 10 }).returning();
    const [sick] = await db.insert(leaveTypes).values({ name: `Sick ${uniqueCode()}`, yearlyQuota: null }).returning();
    casualId = casual.id;
    sickId = sick.id;
  });
  afterAll(() => close());

  async function person() {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Bal ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `Bal Person ${code}`, joinDate: "2036-01-01", shiftId: shift.id }).returning();
    return employee;
  }

  const leave = (employeeId: string, over: Partial<typeof leaveRequests.$inferInsert>) =>
    db.insert(leaveRequests).values({ employeeId, leaveTypeId: casualId, fromDate: "2036-10-05", toDate: "2036-10-07", days: 3, createdBy: userId, ...over });

  it("subtracts approved days from the quota and shows pending days separately", async () => {
    const e = await person();
    await leave(e.id, { status: "approved", decidedBy: userId, decidedAt: new Date() }); // Sun 5 to Tue 7 Oct: 3 working days
    await leave(e.id, { fromDate: "2036-10-12", toDate: "2036-10-13", days: 2 }); // pending

    const rows = await loadBalances(db, { onDate: TODAY, employeeId: e.id });
    const casual = rows.find((r) => r.leaveTypeId === casualId);
    expect(casual).toMatchObject({ quota: 10, used: 3, pending: 2, remaining: 7, year: { from: "2036-01-01", to: "2036-12-31" } });
    expect(rows.find((r) => r.leaveTypeId === sickId)).toMatchObject({ quota: null, used: 0, remaining: null });
  });

  it("does not count rejected or cancelled requests", async () => {
    const e = await person();
    await leave(e.id, { status: "rejected", decidedBy: userId, decidedAt: new Date() });
    await leave(e.id, { fromDate: "2036-10-12", toDate: "2036-10-13", days: 2, status: "cancelled", decidedBy: userId, decidedAt: new Date() });
    const casual = (await loadBalances(db, { onDate: TODAY, employeeId: e.id })).find((r) => r.leaveTypeId === casualId);
    expect(casual).toMatchObject({ used: 0, pending: 0, remaining: 10 });
  });

  it("leaves out the days recorded as unpaid", async () => {
    const e = await person();
    await leave(e.id, { status: "approved", decidedBy: userId, decidedAt: new Date(), unpaidDays: 1 });
    const casual = (await loadBalances(db, { onDate: TODAY, employeeId: e.id })).find((r) => r.leaveTypeId === casualId);
    expect(casual).toMatchObject({ used: 2, remaining: 8 });
  });

  it("works for one person without mixing in another's leave", async () => {
    const a = await person();
    const b = await person();
    await leave(a.id, { status: "approved", decidedBy: userId, decidedAt: new Date() });
    expect((await loadBalances(db, { onDate: TODAY, employeeId: b.id })).find((r) => r.leaveTypeId === casualId)).toMatchObject({ used: 0 });
    expect((await loadBalances(db, { onDate: TODAY, employeeId: a.id })).find((r) => r.leaveTypeId === casualId)).toMatchObject({ used: 3 });
  });

  it("returns nothing for an employee who does not exist", async () => {
    expect(await loadBalances(db, { onDate: TODAY, employeeId: "00000000-0000-4000-8000-000000000000" })).toEqual([]);
  });
});
