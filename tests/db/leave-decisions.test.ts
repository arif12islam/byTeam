import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceDays, auditLog, companySettings, employees, holidays, leaveRequests, leaveTypes, shifts, users } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { recalc } from "@/lib/attendance/recalc";
import { decideLeave } from "@/lib/leave/decisions";
import { createLeaveRequest } from "@/lib/leave/requests";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// March 2035: Sunday the 4th to Saturday the 10th, Friday and Saturday off. Not used by other tests.
const SUN = "2035-03-04";
const MON = "2035-03-05";
const TUE = "2035-03-06";
const WED = "2035-03-07";
const THU = "2035-03-08";
const FRI = "2035-03-09";
const SAT = "2035-03-10";
const AFTER = "2035-03-20"; // a "today" after the whole week
const HOLIDAY = "2035-03-07"; // Wednesday, added for these tests only

describe.skipIf(!testDatabaseUrl)("leave decisions", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;
  let paidTypeId: string;
  let unpaidTypeId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    userId = `decide-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Decider", email: `${userId}@example.test`, role: "hr" });
    const [paid] = await db.insert(leaveTypes).values({ name: `Paid ${uniqueCode()}`, yearlyQuota: 10, isPaid: true }).returning();
    const [unpaid] = await db.insert(leaveTypes).values({ name: `Unpaid ${uniqueCode()}`, isPaid: false }).returning();
    paidTypeId = paid.id;
    unpaidTypeId = unpaid.id;
  });
  afterAll(async () => {
    await db.delete(holidays).where(eq(holidays.date, HOLIDAY));
    await close();
  });

  async function person() {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Dec ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `Dec Person ${code}`, joinDate: "2035-01-01", shiftId: shift.id }).returning();
    return employee;
  }

  /** A pending request, with the week's days already computed as they would be before the leave. */
  async function pending(over: { from?: string; to?: string; typeId?: string; employee?: Awaited<ReturnType<typeof person>> } = {}) {
    const employee = over.employee ?? (await person());
    const made = await createLeaveRequest(db, { employeeId: employee.id, leaveTypeId: over.typeId ?? paidTypeId, fromDate: over.from ?? SUN, toDate: over.to ?? THU }, userId);
    if (!made.ok) throw new Error(made.error);
    await recalc(db, { employeeIds: [employee.id], from: SUN, to: SAT });
    return { employee, requestId: made.requestId };
  }

  const days = async (employeeId: string) => {
    const rows = await db.select().from(attendanceDays).where(eq(attendanceDays.employeeId, employeeId));
    return new Map(rows.map((r) => [r.date, r]));
  };
  const request = async (id: string) => (await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)))[0];

  it("approving turns the absent days into paid leave, and leaves off days alone", async () => {
    const { employee, requestId } = await pending({ from: SUN, to: SAT });
    expect([...(await days(employee.id)).values()].filter((d) => d.status === "absent")).toHaveLength(5);

    expect(await decideLeave(db, requestId, "approve", userId, AFTER)).toEqual({ ok: true, status: "approved" });
    const after = await days(employee.id);
    for (const d of [SUN, MON, TUE, WED, THU]) expect(after.get(d)?.status, d).toBe("leave_paid");
    expect(after.get(FRI)?.status).toBe("weekly_off");
    expect(after.get(SAT)?.status).toBe("weekly_off");

    expect(await request(requestId)).toMatchObject({ status: "approved", decidedBy: userId });
    expect((await request(requestId)).decidedAt).not.toBeNull();
    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, requestId), eq(auditLog.action, "leave.approve")));
    expect(entry).toMatchObject({ actorId: userId, entity: "leave_request" });
    expect(entry.before).toMatchObject({ status: "pending" });
    expect(entry.after).toMatchObject({ status: "approved" });
  });

  it("makes unpaid leave types unpaid days", async () => {
    const { employee, requestId } = await pending({ typeId: unpaidTypeId, from: MON, to: TUE });
    await decideLeave(db, requestId, "approve", userId, AFTER);
    const after = await days(employee.id);
    expect(after.get(MON)?.status).toBe("leave_unpaid");
    expect(after.get(TUE)?.status).toBe("leave_unpaid");
  });

  it("makes the last days of a request unpaid when some are recorded as unpaid", async () => {
    const { employee, requestId } = await pending({ from: SUN, to: THU });
    await db.update(leaveRequests).set({ unpaidDays: 2 }).where(eq(leaveRequests.id, requestId));
    await decideLeave(db, requestId, "approve", userId, AFTER);
    const after = await days(employee.id);
    expect([SUN, MON, TUE, WED, THU].map((d) => after.get(d)?.status)).toEqual(["leave_paid", "leave_paid", "leave_paid", "leave_unpaid", "leave_unpaid"]);
  });

  it("outranks a punch, but not a holiday", async () => {
    await db.insert(holidays).values({ date: HOLIDAY, name: "Decision test holiday" }).onConflictDoNothing();
    const employee = await person();
    const serial = uniqueSerial("D");
    await addTestDevice(db, serial);
    await savePunches(db, [{ deviceSn: serial, empCode: employee.empCode, punchedAt: officeDateTimeToInstant(MON, "09:00")!, statusCode: 0, verifyCode: 1, rawLine: "x" }]);
    const { requestId } = await pending({ employee, from: MON, to: THU });
    await decideLeave(db, requestId, "approve", userId, AFTER);
    const after = await days(employee.id);
    expect(after.get(MON)).toMatchObject({ status: "leave_paid", punchCount: 1 });
    expect(after.get(WED)?.status).toBe("holiday");
    expect(after.get(TUE)?.status).toBe("leave_paid");
    expect(after.get(THU)?.status).toBe("leave_paid");
    await db.delete(holidays).where(eq(holidays.date, HOLIDAY));
  });

  it("cancelling approved leave puts the days back, and rejecting changes no days", async () => {
    const approved = await pending({ from: MON, to: TUE });
    await decideLeave(db, approved.requestId, "approve", userId, AFTER);
    expect((await days(approved.employee.id)).get(MON)?.status).toBe("leave_paid");

    expect(await decideLeave(db, approved.requestId, "cancel", userId, AFTER)).toEqual({ ok: true, status: "cancelled" });
    expect((await days(approved.employee.id)).get(MON)?.status).toBe("absent");
    expect((await days(approved.employee.id)).get(TUE)?.status).toBe("absent");

    const rejected = await pending({ from: MON, to: TUE });
    expect(await decideLeave(db, rejected.requestId, "reject", userId, AFTER)).toEqual({ ok: true, status: "rejected" });
    expect((await days(rejected.employee.id)).get(MON)?.status).toBe("absent");
    expect(await request(rejected.requestId)).toMatchObject({ status: "rejected", decidedBy: userId });
  });

  it("lets a pending request be cancelled, with no change to the days", async () => {
    const { employee, requestId } = await pending({ from: MON, to: MON });
    expect(await decideLeave(db, requestId, "cancel", userId, AFTER)).toEqual({ ok: true, status: "cancelled" });
    expect((await days(employee.id)).get(MON)?.status).toBe("absent");
  });

  it("refuses a decision that does not fit the request's status, and says so", async () => {
    const { requestId } = await pending({ from: MON, to: MON });
    await decideLeave(db, requestId, "approve", userId, AFTER);
    expect(await decideLeave(db, requestId, "approve", userId, AFTER)).toEqual({ ok: false, error: "That request is already approved, so it cannot be approved." });
    expect(await decideLeave(db, requestId, "reject", userId, AFTER)).toMatchObject({ ok: false });
    await decideLeave(db, requestId, "cancel", userId, AFTER);
    expect(await decideLeave(db, requestId, "cancel", userId, AFTER)).toMatchObject({ ok: false, error: expect.stringContaining("already cancelled") });
    expect(await decideLeave(db, requestId, "approve", userId, AFTER)).toMatchObject({ ok: false });
    expect(await request(requestId)).toMatchObject({ status: "cancelled" });
  });

  it("refuses an unknown request and an unknown decision", async () => {
    expect(await decideLeave(db, "00000000-0000-4000-8000-000000000000", "approve", userId, AFTER)).toEqual({
      ok: false,
      error: "That leave request no longer exists. Reload the page.",
    });
    const { requestId } = await pending({ from: MON, to: MON });
    expect(await decideLeave(db, requestId, "delete" as never, userId, AFTER)).toMatchObject({ ok: false });
    expect(await request(requestId)).toMatchObject({ status: "pending" });
  });

  it("lets only one of two simultaneous approvals win", async () => {
    const { requestId } = await pending({ from: MON, to: MON });
    const results = await Promise.all([decideLeave(db, requestId, "approve", userId, AFTER), decideLeave(db, requestId, "approve", userId, AFTER)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const entries = await db.select().from(auditLog).where(and(eq(auditLog.entityId, requestId), eq(auditLog.action, "leave.approve")));
    expect(entries).toHaveLength(1);
  });

  it("creates no attendance rows for leave that is still to come", async () => {
    const { employee, requestId } = await pending({ from: WED, to: THU });
    await db.delete(attendanceDays).where(eq(attendanceDays.employeeId, employee.id));
    // "Today" is the Sunday before the leave starts.
    expect(await decideLeave(db, requestId, "approve", userId, SUN)).toMatchObject({ ok: true });
    expect([...(await days(employee.id)).keys()]).toEqual([]);
  });

  it("recomputes only up to today for leave that has started", async () => {
    const { employee, requestId } = await pending({ from: SUN, to: THU });
    await db.delete(attendanceDays).where(eq(attendanceDays.employeeId, employee.id));
    await decideLeave(db, requestId, "approve", userId, TUE);
    expect([...(await days(employee.id)).keys()].sort()).toEqual([SUN, MON, TUE]);
  });
});
