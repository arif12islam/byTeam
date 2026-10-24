import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceDays, auditLog, companySettings, employees, leaveRequests, leaveTypes, shifts, users } from "@/db/schema";
import { recalc } from "@/lib/attendance/recalc";
import { loadBalances } from "@/lib/leave/balances";
import { decideLeave } from "@/lib/leave/decisions";
import { createLeaveRequest } from "@/lib/leave/requests";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

// Everyone joins on 1 January 2037 and all leave is in 2037, so the leave year is the same under either
// setting of the shared leave year basis. September and October 2037, Friday and Saturday off.
// Sun 6 Sep to Thu 10 Sep is five working days; Sun 13 Sep to Thu 17 Sep another five.
const WEEK_1 = ["2037-09-06", "2037-09-10"] as const;
const WEEK_2 = ["2037-09-13", "2037-09-17"] as const;
const TODAY = "2037-10-24";

describe.skipIf(!testDatabaseUrl)("approving leave against the balance", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    userId = `block-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Approver", email: `${userId}@example.test`, role: "hr" });
  });
  afterAll(() => close());

  async function setup(quota: number | null) {
    const code = uniqueCode();
    const [type] = await db.insert(leaveTypes).values({ name: `Block ${code}`, yearlyQuota: quota }).returning();
    const [shift] = await db.insert(shifts).values({ name: `Blk ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `Block Person ${code}`, joinDate: "2037-01-01", shiftId: shift.id }).returning();
    return { type, employee };
  }

  async function request(employeeId: string, leaveTypeId: string, [fromDate, toDate]: readonly [string, string]) {
    const made = await createLeaveRequest(db, { employeeId, leaveTypeId, fromDate, toDate }, userId);
    if (!made.ok) throw new Error(made.error);
    return made.requestId;
  }

  const get = async (id: string) => (await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)))[0];
  const approve = (id: string, unpaidDays?: number) => decideLeave(db, id, "approve", userId, { today: TODAY, unpaidDays });

  it("approves a request that fits in the balance", async () => {
    const { type, employee } = await setup(5);
    const id = await request(employee.id, type.id, WEEK_1);
    expect(await approve(id)).toEqual({ ok: true, status: "approved" });
    expect(await get(id)).toMatchObject({ status: "approved", unpaidDays: 0 });
  });

  it("refuses a request that goes past the balance, says what would fit, and changes nothing", async () => {
    const { type, employee } = await setup(3);
    const id = await request(employee.id, type.id, WEEK_1);

    const result = await approve(id);
    expect(result).toMatchObject({ ok: false, suggestedUnpaidDays: 2 });
    if (result.ok) return;
    expect(result.error).toContain("has 3 days of");
    expect(result.error).toContain("needs 5");
    expect(result.error).toContain("Approve it with 2 days unpaid");

    expect(await get(id)).toMatchObject({ status: "pending", decidedBy: null, unpaidDays: 0 });
    expect(await db.select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, "leave.approve")))).toHaveLength(0);
  });

  it("approves it once the extra days are recorded as unpaid, and the last days become unpaid in attendance", async () => {
    const { type, employee } = await setup(3);
    const id = await request(employee.id, type.id, WEEK_1);
    await recalc(db, { employeeIds: [employee.id], from: WEEK_1[0], to: WEEK_1[1] });

    expect(await approve(id, 2)).toEqual({ ok: true, status: "approved" });
    expect(await get(id)).toMatchObject({ status: "approved", unpaidDays: 2 });

    const rows = await db.select().from(attendanceDays).where(eq(attendanceDays.employeeId, employee.id));
    const status = new Map(rows.map((r) => [r.date, r.status]));
    expect(["2037-09-06", "2037-09-07", "2037-09-08", "2037-09-09", "2037-09-10"].map((d) => status.get(d))).toEqual([
      "leave_paid",
      "leave_paid",
      "leave_paid",
      "leave_unpaid",
      "leave_unpaid",
    ]);

    // The balance is used up exactly: the two unpaid days are not taken from it.
    const balance = (await loadBalances(db, { onDate: TODAY, employeeId: employee.id })).find((b) => b.leaveTypeId === type.id);
    expect(balance).toMatchObject({ used: 3, remaining: 0 });
  });

  it("still refuses when too few days are recorded as unpaid", async () => {
    const { type, employee } = await setup(3);
    const id = await request(employee.id, type.id, WEEK_1);
    expect(await approve(id, 1)).toMatchObject({ ok: false, suggestedUnpaidDays: 2 });
    expect((await get(id)).status).toBe("pending");
  });

  it("refuses unpaid days that make no sense", async () => {
    const { type, employee } = await setup(10);
    const id = await request(employee.id, type.id, WEEK_1);
    for (const bad of [-1, 6, 1.5]) {
      expect(await approve(id, bad), String(bad)).toMatchObject({ ok: false, error: "Unpaid days must be a whole number from 0 to 5." });
    }
    expect((await get(id)).status).toBe("pending");
  });

  it("counts the person's other approved leave of the same type against the balance", async () => {
    const { type, employee } = await setup(7);
    const first = await request(employee.id, type.id, WEEK_1);
    const second = await request(employee.id, type.id, WEEK_2);
    expect(await approve(first)).toMatchObject({ ok: true });
    expect(await approve(second)).toMatchObject({ ok: false, suggestedUnpaidDays: 3 }); // 7 - 5 = 2 left, needs 5
    expect(await approve(second, 3)).toMatchObject({ ok: true });
  });

  it("does not count pending, rejected or cancelled requests, and cancelling approved leave frees the days", async () => {
    const { type, employee } = await setup(5);
    const first = await request(employee.id, type.id, WEEK_1);
    expect(await approve(first)).toMatchObject({ ok: true });
    const second = await request(employee.id, type.id, WEEK_2);
    expect(await approve(second)).toMatchObject({ ok: false });

    await decideLeave(db, first, "cancel", userId, { today: TODAY });
    expect(await approve(second)).toMatchObject({ ok: true });
  });

  it("does not limit a type without a quota", async () => {
    const { type, employee } = await setup(null);
    const id = await request(employee.id, type.id, ["2037-09-06", "2037-09-30"]);
    expect(await approve(id)).toMatchObject({ ok: true });
  });

  it("does not mix leave types: another type's leave does not use this type's balance", async () => {
    const { type, employee } = await setup(5);
    const [other] = await db.insert(leaveTypes).values({ name: `Other ${uniqueCode()}`, yearlyQuota: 20 }).returning();
    const otherId = await request(employee.id, other.id, WEEK_1);
    expect(await approve(otherId)).toMatchObject({ ok: true });
    const id = await request(employee.id, type.id, WEEK_2);
    expect(await approve(id)).toMatchObject({ ok: true });
  });

  it("lets only the approvals that fit through when two for the same person are decided at once", async () => {
    const { type, employee } = await setup(5);
    const a = await request(employee.id, type.id, WEEK_1);
    const b = await request(employee.id, type.id, WEEK_2);
    const results = await Promise.all([approve(a), approve(b)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const used = (await loadBalances(db, { onDate: TODAY, employeeId: employee.id })).find((x) => x.leaveTypeId === type.id)!.used;
    expect(used).toBe(5);
  });

  it("waits for anyone else who is deciding leave for the same person", async () => {
    const { type, employee } = await setup(10);
    const id = await request(employee.id, type.id, WEEK_1);

    // Stand in for another approval that is part-way through: it holds the person's record locked.
    let release!: () => void;
    let locked!: () => void;
    const holding = new Promise<void>((resolve) => (release = resolve));
    const gotLock = new Promise<void>((resolve) => (locked = resolve));
    const other = db.transaction(async (tx) => {
      await tx.select().from(employees).where(eq(employees.id, employee.id)).for("update");
      locked();
      await holding;
    });
    await gotLock;

    // "Today" is before the leave starts, so no attendance days are written afterwards. Those writes would
    // also wait on this lock, and the test must show that the approval itself waits.
    let finished = false;
    const approval = decideLeave(db, id, "approve", userId, { today: "2037-09-01" }).then((r) => {
      finished = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(finished).toBe(false); // still waiting its turn

    release();
    await other;
    expect(await approval).toMatchObject({ ok: true });
  });

  it("still allows rejecting and cancelling a request that is over the balance", async () => {
    const { type, employee } = await setup(0);
    const id = await request(employee.id, type.id, WEEK_1);
    expect(await approve(id)).toMatchObject({ ok: false, suggestedUnpaidDays: 5 });
    expect(await decideLeave(db, id, "reject", userId, { today: TODAY })).toEqual({ ok: true, status: "rejected" });
  });
});
