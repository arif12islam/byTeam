import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, companySettings, employees, holidays, leaveRequests, leaveTypes, shifts, users } from "@/db/schema";
import { createLeaveRequest, listLeaveRequests } from "@/lib/leave/requests";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

// March 2034 is not used by other tests. Sunday 5th to Saturday 11th, with Friday and Saturday off.
const SUN = "2034-03-05";
const MON = "2034-03-06";
const TUE = "2034-03-07";
const WED = "2034-03-08";
const THU = "2034-03-09";
const FRI = "2034-03-10";
const SAT = "2034-03-11";
const NEXT_SUN = "2034-03-12";
const HOLIDAY = "2034-03-07"; // a Tuesday holiday, added for these tests only

describe.skipIf(!testDatabaseUrl)("creating leave requests", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;
  let typeId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    // Friday and Saturday off: the same value the other database tests use for the shared settings row.
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    userId = `request-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "hr" });
    const [type] = await db.insert(leaveTypes).values({ name: `Request ${uniqueCode()}`, yearlyQuota: 10 }).returning();
    typeId = type.id;
  });
  afterAll(async () => {
    await db.delete(holidays).where(eq(holidays.date, HOLIDAY));
    await close();
  });

  async function person(over: Partial<typeof employees.$inferInsert> = {}) {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Req ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    const [employee] = await db
      .insert(employees)
      .values({ empCode: code, name: `Req Person ${code}`, joinDate: "2034-01-01", shiftId: shift.id, ...over })
      .returning();
    return employee;
  }

  const make = (employeeId: string, over: Partial<Parameters<typeof createLeaveRequest>[1]> = {}) =>
    createLeaveRequest(db, { employeeId, leaveTypeId: typeId, fromDate: SUN, toDate: THU, ...over }, userId);

  it("saves a pending request with the working-day count and an audit row", async () => {
    const e = await person();
    const result = await make(e.id, { note: "  Family event  " });
    expect(result).toMatchObject({ ok: true, days: 5 });
    if (!result.ok) return;

    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, result.requestId));
    expect(row).toMatchObject({ employeeId: e.id, status: "pending", days: 5, unpaidDays: 0, note: "Family event", createdBy: userId, decidedBy: null });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, row.id));
    expect(entry).toMatchObject({ action: "leave.create", actorId: userId, entity: "leave_request" });
  });

  it("skips weekly off days and holidays when counting", async () => {
    const e = await person();
    expect(await make(e.id, { fromDate: THU, toDate: NEXT_SUN })).toMatchObject({ ok: true, days: 2 }); // Thu and Sun; Fri and Sat are off

    await db.insert(holidays).values({ date: HOLIDAY, name: "Request test holiday" }).onConflictDoNothing();
    const f = await person();
    expect(await make(f.id, { fromDate: MON, toDate: WED })).toMatchObject({ ok: true, days: 2 }); // Tuesday is a holiday
  });

  it("refuses a request that is only days off, and writes nothing", async () => {
    const e = await person();
    const result = await make(e.id, { fromDate: FRI, toDate: SAT });
    expect(result).toEqual({ ok: false, error: "Those dates are all days off, so there is no leave to record." });
    expect(await db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, e.id))).toHaveLength(0);
  });

  it("refuses dates in the wrong order, a range over a year, and bad dates", async () => {
    const e = await person();
    expect(await make(e.id, { fromDate: THU, toDate: SUN })).toEqual({ ok: false, error: "The last day cannot be before the first day." });
    const tooLong = await make(e.id, { fromDate: "2034-01-01", toDate: "2035-06-01" });
    expect(tooLong.ok).toBe(false);
    expect(await make(e.id, { fromDate: "2034-02-30" })).toMatchObject({ ok: false });
    expect(await make(e.id, { fromDate: "" })).toMatchObject({ ok: false });
    expect(await make("not-an-id")).toEqual({ ok: false, error: "Choose an employee." });
    expect(await make(e.id, { leaveTypeId: "" })).toEqual({ ok: false, error: "Choose a leave type." });
    expect(await make(e.id, { note: "x".repeat(301) })).toMatchObject({ ok: false });
  });

  it("refuses dates outside the person's time at the company, and former or unknown employees", async () => {
    const joined = await person({ joinDate: MON });
    expect(await make(joined.id, { fromDate: SUN, toDate: WED })).toMatchObject({ ok: false, error: expect.stringContaining("joined on") });
    expect(await make(joined.id, { fromDate: MON, toDate: WED })).toMatchObject({ ok: true });

    const leaving = await person({ exitDate: TUE });
    expect(await make(leaving.id, { fromDate: SUN, toDate: WED })).toMatchObject({ ok: false, error: expect.stringContaining("leaves on") });

    const gone = await person({ active: false });
    expect(await make(gone.id)).toEqual({ ok: false, error: "That employee is no longer active." });
    expect(await make("00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, error: "That employee no longer exists." });
  });

  it("refuses an unknown or switched-off type", async () => {
    const e = await person();
    expect(await make(e.id, { leaveTypeId: "00000000-0000-4000-8000-000000000000" })).toEqual({ ok: false, error: "That leave type no longer exists." });
    const [off] = await db.insert(leaveTypes).values({ name: `Off ${uniqueCode()}`, active: false }).returning();
    expect(await make(e.id, { leaveTypeId: off.id })).toMatchObject({ ok: false, error: expect.stringContaining("not in use") });
  });

  it("refuses dates that overlap pending or approved leave, but not rejected, cancelled or neighbouring leave", async () => {
    const e = await person();
    const first = await make(e.id, { fromDate: MON, toDate: TUE });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(await make(e.id, { fromDate: TUE, toDate: WED })).toMatchObject({ ok: false, error: expect.stringContaining("already has pending leave") });
    expect(await make(e.id, { fromDate: SUN, toDate: SUN })).toMatchObject({ ok: true }); // the day before
    expect(await make(e.id, { fromDate: WED, toDate: WED })).toMatchObject({ ok: true }); // the day after

    await db.update(leaveRequests).set({ status: "approved", decidedBy: userId, decidedAt: new Date() }).where(eq(leaveRequests.id, first.requestId));
    expect(await make(e.id, { fromDate: MON, toDate: MON })).toMatchObject({ ok: false, error: expect.stringContaining("already has approved leave") });

    await db.update(leaveRequests).set({ status: "rejected" }).where(eq(leaveRequests.id, first.requestId));
    expect(await make(e.id, { fromDate: MON, toDate: MON })).toMatchObject({ ok: true });
  });

  it("lets two different people take the same days", async () => {
    const a = await person();
    const b = await person();
    expect((await make(a.id)).ok).toBe(true);
    expect((await make(b.id)).ok).toBe(true);
  });

  it("stores no note when it is blank", async () => {
    const e = await person();
    const result = await make(e.id, { note: "   " });
    if (!result.ok) throw new Error(result.error);
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, result.requestId));
    expect(row.note).toBeNull();
  });

  it("lists pending requests first, then the newest leave, with names", async () => {
    const e = await person();
    const old = await make(e.id, { fromDate: SUN, toDate: SUN });
    const recent = await make(e.id, { fromDate: THU, toDate: THU });
    if (!old.ok || !recent.ok) throw new Error("setup failed");
    await db.update(leaveRequests).set({ status: "approved", decidedBy: userId, decidedAt: new Date() }).where(eq(leaveRequests.id, recent.requestId));

    const mine = (await listLeaveRequests(db)).filter((r) => r.employeeId === e.id);
    expect(mine.map((r) => [r.id, r.status])).toEqual([
      [old.requestId, "pending"],
      [recent.requestId, "approved"],
    ]);
    expect(mine[0]).toMatchObject({ employeeName: e.name, empCode: e.empCode, isPaid: true, days: 1 });
    expect((await listLeaveRequests(db, { status: "approved" })).every((r) => r.status === "approved")).toBe(true);
  });
});
