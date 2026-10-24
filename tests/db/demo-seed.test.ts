import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceDays, auditLog, companySettings, devices, employees, holidays, leaveRequests, payrollAdjustments, rawPunches, salaryStructures, shifts, users } from "@/db/schema";
import { applyDemoPlan } from "@/lib/demo/seed";
import { buildDemoPlan, DEMO_EMPLOYEE_COUNT, DEMO_SHIFT } from "@/lib/demo/scenarios";

import { connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// September 2018 starts on a Saturday. Nothing else in the tests uses 2018.
const MONTH = "2018-09";
const TODAY = "2018-10-05";

describe.skipIf(!testDatabaseUrl)("demo data", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actorId: string;

  const codes = () => Array.from({ length: DEMO_EMPLOYEE_COUNT }, () => uniqueCode());
  const names = () => {
    const id = uniqueCode();
    return { shift: `Demo shift ${id}`, paidLeave: `Demo casual ${id}`, unpaidLeave: `Demo unpaid ${id}` };
  };

  beforeAll(async () => {
    ({ db, close } = connect());
    actorId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: actorId, name: "Seeder", email: `${actorId}@example.test`, role: "owner" });
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
  });
  afterAll(() => close());

  it("adds the whole story through the normal functions", async () => {
    const plan = buildDemoPlan(MONTH, [5, 6], codes());
    const serial = uniqueSerial("D");
    const summary = await applyDemoPlan(db, plan, { actorId, deviceSerial: serial, today: TODAY, names: names() });

    const planned = new Set(plan.employees.flatMap((e) => e.punches.map((p) => `${e.empCode}|${p.date}|${p.time}`))).size;
    expect(summary).toEqual({ employees: 8, punches: planned, leaveRequests: 2, adjustments: 3 });

    const staff = await db.select().from(employees).where(inArray(employees.empCode, plan.employees.map((e) => e.empCode)));
    expect(staff).toHaveLength(8);
    const idOf = (key: string) => staff.find((s) => s.empCode === plan.employees.find((e) => e.key === key)!.empCode)!.id;

    // Pay, leave and bonuses are saved the way the screens save them.
    expect(await db.select().from(salaryStructures).where(inArray(salaryStructures.employeeId, staff.map((s) => s.id)))).toHaveLength(8);
    const leave = await db.select().from(leaveRequests).where(inArray(leaveRequests.employeeId, staff.map((s) => s.id)));
    expect(leave.map((l) => l.status)).toEqual(["approved", "approved"]);
    expect(await db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.month, `${MONTH}-01`), inArray(payrollAdjustments.employeeId, staff.map((s) => s.id))))).toHaveLength(3);

    // The holiday and the fake device are there, and the device is switched off.
    expect(await db.select().from(holidays).where(eq(holidays.date, plan.holiday.date))).toHaveLength(1);
    const [device] = await db.select().from(devices).where(eq(devices.serialNo, serial));
    expect(device.active).toBe(false);
    expect(await db.select().from(rawPunches).where(eq(rawPunches.deviceSn, serial))).toHaveLength(planned);

    // Attendance was brought up to date.
    const status = async (key: string, date: string) =>
      (await db.select({ s: attendanceDays.status }).from(attendanceDays).where(and(eq(attendanceDays.employeeId, idOf(key)), eq(attendanceDays.date, date))))[0]?.s;
    expect(await status("absent_paid_leave", plan.workingDates[6])).toBe("leave_paid");
    expect(await status("absent_unpaid_leave", plan.workingDates[10])).toBe("leave_unpaid");
    expect(await status("absent_no_leave", plan.workingDates[3])).toBe("absent");
    expect(await status("on_time", plan.holiday.date)).toBe("holiday");

    // Every human change is audited.
    const created = await db.select().from(auditLog).where(and(eq(auditLog.action, "employee.create"), inArray(auditLog.entityId, staff.map((s) => s.id))));
    expect(created).toHaveLength(8);
  }, 60_000);

  it("refuses when an employee code is already in use, and adds nothing", async () => {
    const plan = buildDemoPlan(MONTH, [5, 6], codes());
    const n = names();
    // The third code already belongs to someone.
    const [shift] = await db.insert(shifts).values({ name: `Taken ${n.shift}`, startTime: "09:00", endTime: "18:00" }).returning();
    await db.insert(employees).values({ empCode: plan.employees[2].empCode, name: "Already here", joinDate: "2010-01-01", shiftId: shift.id });

    await expect(applyDemoPlan(db, plan, { actorId, deviceSerial: uniqueSerial("D"), today: TODAY, names: n })).rejects.toThrow(
      `Employee code ${plan.employees[2].empCode} is already in use.`,
    );
    const others = plan.employees.filter((_, i) => i !== 2).map((e) => e.empCode);
    expect(await db.select().from(employees).where(inArray(employees.empCode, others))).toHaveLength(0);
    expect(await db.select().from(shifts).where(eq(shifts.name, n.shift))).toHaveLength(0);
  });

  it("refuses when the demo shift has been changed", async () => {
    const n = names();
    await db.insert(shifts).values({ name: n.shift, startTime: "08:00", endTime: "17:00", graceMinutes: DEMO_SHIFT.graceMinutes });
    const plan = buildDemoPlan(MONTH, [5, 6], codes());
    await expect(applyDemoPlan(db, plan, { actorId, deviceSerial: uniqueSerial("D"), today: TODAY, names: n })).rejects.toThrow(/has been changed/);
  });

  it("refuses when a leave type with the demo name has the wrong kind of pay", async () => {
    const n = names();
    // The paid name already belongs to an unpaid type.
    const { createLeaveType } = await import("@/lib/leave/types");
    await createLeaveType(db, { name: n.paidLeave, yearlyQuota: "", isPaid: false }, actorId);
    const plan = buildDemoPlan(MONTH, [5, 6], codes());
    await expect(applyDemoPlan(db, plan, { actorId, deviceSerial: uniqueSerial("D"), today: TODAY, names: n })).rejects.toThrow(/must be a paid leave type/);
  });
});
