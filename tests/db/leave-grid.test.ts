import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companySettings, employees, leaveTypes, shifts, users } from "@/db/schema";
import { loadMonthGrid } from "@/lib/attendance/month";
import { loadTodayBoard } from "@/lib/attendance/today";
import { loadBalances } from "@/lib/leave/balances";
import { decideLeave } from "@/lib/leave/decisions";
import { createLeaveRequest } from "@/lib/leave/requests";
import { officeDateTimeToInstant } from "@/lib/time";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

// June 2038, Friday and Saturday off. Everyone joins on 1 January 2038 and the leave year is the same under
// either setting of the shared leave year basis. Sun 6 June to Thu 10 June is five working days, with Friday
// the 4th and Saturday the 5th just before and the 11th and 12th just after.
const MONTH = "2038-06";
const TODAY = "2038-06-20";

describe.skipIf(!testDatabaseUrl)("approved leave across the screens", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    userId = `grid-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Grid Tester", email: `${userId}@example.test`, role: "hr" });
  });
  afterAll(() => close());

  async function setup(quota: number) {
    const code = uniqueCode();
    const [type] = await db.insert(leaveTypes).values({ name: `Grid ${code}`, yearlyQuota: quota }).returning();
    const [shift] = await db.insert(shifts).values({ name: `Grid ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `Grid Person ${code}`, joinDate: "2038-01-01", shiftId: shift.id }).returning();
    return { type, employee };
  }

  const cellsOf = async (employeeId: string) => {
    const grid = await loadMonthGrid(db, MONTH, TODAY);
    const row = grid.rows.find((r) => r.employee.id === employeeId);
    if (!row) throw new Error("employee missing from the grid");
    return row;
  };

  it("turns absent days into leave in the grid, keeps off days as off days, and counts the totals", async () => {
    const { type, employee } = await setup(10);
    const made = await createLeaveRequest(db, { employeeId: employee.id, leaveTypeId: type.id, fromDate: "2038-06-04", toDate: "2038-06-12" }, userId);
    if (!made.ok) throw new Error(made.error);
    // Fri 4 to Sat 12: Sun 6 to Thu 10 are working days, so five.
    expect(made.days).toBe(5);

    const before = await cellsOf(employee.id);
    expect(before.cells.get("2038-06-07")?.status).toBe("absent");
    expect(before.totals.leave).toBe(0);

    expect(await decideLeave(db, made.requestId, "approve", userId, { today: TODAY })).toEqual({ ok: true, status: "approved" });

    const after = await cellsOf(employee.id);
    for (const date of ["2038-06-06", "2038-06-07", "2038-06-08", "2038-06-09", "2038-06-10"]) {
      expect(after.cells.get(date)?.status, date).toBe("leave_paid");
    }
    // The off days around it are still off days, not leave.
    for (const date of ["2038-06-04", "2038-06-05", "2038-06-11", "2038-06-12"]) {
      expect(after.cells.get(date)?.status, date).toBe("weekly_off");
    }
    // Absent working days up to "today" (the 20th): Tue 1 to Thu 3, Sun 13 to Thu 17 and Sun 20.
    expect(after.totals).toMatchObject({ leave: 5, absent: 9 });
  });

  it("shows the person as on leave on the Today board during their leave", async () => {
    const { type, employee } = await setup(10);
    const made = await createLeaveRequest(db, { employeeId: employee.id, leaveTypeId: type.id, fromDate: "2038-06-06", toDate: "2038-06-10" }, userId);
    if (!made.ok) throw new Error(made.error);
    await decideLeave(db, made.requestId, "approve", userId, { today: TODAY });

    const during = await loadTodayBoard(db, officeDateTimeToInstant("2038-06-08", "12:00")!);
    expect(during.entries.find((e) => e.id === employee.id)).toMatchObject({ group: "on_leave", status: "leave_paid" });
    const after = await loadTodayBoard(db, officeDateTimeToInstant("2038-06-13", "12:00")!);
    expect(after.entries.find((e) => e.id === employee.id)?.group).toBe("not_in_yet");
  });

  it("keeps the balance, the grid and the request in step through approve, approve with unpaid days, and cancel", async () => {
    const { type, employee } = await setup(3);
    const made = await createLeaveRequest(db, { employeeId: employee.id, leaveTypeId: type.id, fromDate: "2038-06-06", toDate: "2038-06-10" }, userId);
    if (!made.ok) throw new Error(made.error);
    const balance = async () => (await loadBalances(db, { onDate: TODAY, employeeId: employee.id })).find((b) => b.leaveTypeId === type.id)!;

    expect(await balance()).toMatchObject({ used: 0, pending: 5, remaining: 3 });

    // Five days against three left: refused, and nothing moves.
    expect(await decideLeave(db, made.requestId, "approve", userId, { today: TODAY })).toMatchObject({ ok: false, suggestedUnpaidDays: 2 });
    expect(await balance()).toMatchObject({ used: 0, pending: 5, remaining: 3 });
    expect((await cellsOf(employee.id)).cells.get("2038-06-07")?.status).toBe("absent");

    expect(await decideLeave(db, made.requestId, "approve", userId, { today: TODAY, unpaidDays: 2 })).toMatchObject({ ok: true });
    expect(await balance()).toMatchObject({ used: 3, pending: 0, remaining: 0 });
    const row = await cellsOf(employee.id);
    expect(["2038-06-06", "2038-06-07", "2038-06-08", "2038-06-09", "2038-06-10"].map((d) => row.cells.get(d)?.status)).toEqual([
      "leave_paid",
      "leave_paid",
      "leave_paid",
      "leave_unpaid",
      "leave_unpaid",
    ]);

    expect(await decideLeave(db, made.requestId, "cancel", userId, { today: TODAY })).toEqual({ ok: true, status: "cancelled" });
    expect(await balance()).toMatchObject({ used: 0, pending: 0, remaining: 3 });
    expect((await cellsOf(employee.id)).cells.get("2038-06-07")?.status).toBe("absent");
  });

  it("leaves other people's days alone", async () => {
    const a = await setup(10);
    const b = await setup(10);
    const made = await createLeaveRequest(db, { employeeId: a.employee.id, leaveTypeId: a.type.id, fromDate: "2038-06-06", toDate: "2038-06-10" }, userId);
    if (!made.ok) throw new Error(made.error);
    await decideLeave(db, made.requestId, "approve", userId, { today: TODAY });
    expect((await cellsOf(b.employee.id)).cells.get("2038-06-07")?.status).toBe("absent");
    expect((await cellsOf(b.employee.id)).totals.leave).toBe(0);
  });
});
