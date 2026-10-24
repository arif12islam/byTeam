import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  attendanceDays,
  companySettings,
  employees,
  leaveRequests,
  leaveTypes,
  payrollAdjustments,
  payrollItems,
  payrollRuns,
  ruleSets,
  salaryStructures,
  shifts,
  users,
  auditLog,
} from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { addAdjustment } from "@/lib/attendance/adjustments";
import { recalc } from "@/lib/attendance/recalc";
import { createLeaveRequest } from "@/lib/leave/requests";
import { decideLeave } from "@/lib/leave/decisions";
import { addPayrollAdjustment, removePayrollAdjustment } from "@/lib/payroll/adjustments";
import { createDraftRun, finalizeRun, loadPayrollSheet, recomputeRun } from "@/lib/payroll/runs";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// May 2014 begins on a Thursday. With Friday and Saturday off it has 21 working days.
// Nothing else in the tests uses 2014.
const MONTH = "2014-05";
const FIRST = `${MONTH}-01`;
const AFTER = "2014-06-10"; // "today": May is over
const WORKING_DAYS = [1, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29];
const at = (day: number, time: string) => officeDateTimeToInstant(`${MONTH}-${String(day).padStart(2, "0")}`, time)!;
const may = (day: number) => `${MONTH}-${String(day).padStart(2, "0")}`;

describe.skipIf(!testDatabaseUrl)("finalizing payroll", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;
  let a: { id: string; code: string };
  let runId: string;
  let pendingLeaveId: string;
  const serial = uniqueSerial("F");

  const punch = (code: string, day: number, time: string) => ({
    deviceSn: serial,
    empCode: code,
    punchedAt: at(day, time),
    statusCode: 0,
    verifyCode: 1,
    rawLine: `${code} ${day} ${time}`,
  });
  const statusOn = async (employeeId: string, date: string) =>
    (await db.select({ status: attendanceDays.status }).from(attendanceDays).where(and(eq(attendanceDays.employeeId, employeeId), eq(attendanceDays.date, date))))[0]?.status;

  async function person(join: string, salary: boolean) {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Fin ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `Finalize ${code}`, joinDate: join, shiftId: shift.id }).returning();
    if (salary) {
      await db.insert(salaryStructures).values({
        employeeId: employee.id,
        gross: "30000.00",
        basicPct: "50",
        housePct: "20",
        medicalPct: "10",
        conveyancePct: "10",
        effectiveFrom: "2014-01-01",
      });
    }
    return { id: employee.id, code };
  }

  beforeAll(async () => {
    ({ db, close } = connect());
    userId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Owner tester", email: `${userId}@example.test`, role: "owner" });
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    await db.delete(payrollRuns).where(eq(payrollRuns.month, FIRST));
    await db.delete(payrollRuns).where(eq(payrollRuns.month, "2014-06-01"));
    await db.delete(payrollAdjustments).where(eq(payrollAdjustments.month, FIRST));
    await db
      .insert(ruleSets)
      .values({ effectiveFromMonth: "2010-01-01", lateMode: "days_per_lates", lateEveryN: 3, deductionBase: "gross", divisor: "working_days", createdBy: userId })
      .onConflictDoUpdate({
        target: ruleSets.effectiveFromMonth,
        set: { lateMode: "days_per_lates", lateEveryN: 3, lateAmount: null, deductionBase: "gross", divisor: "working_days", unpaidLeaveAsAbsent: true },
      });
    await addTestDevice(db, serial);

    a = await person("2000-01-01", true);
    // Present every working day except the 6th and the 7th.
    await savePunches(db, WORKING_DAYS.filter((d) => d !== 6 && d !== 7).map((d) => punch(a.code, d, "08:55")));

    // A leave request waiting for a decision when the month is finalized.
    const [type] = await db.insert(leaveTypes).values({ name: `Fin ${a.code}`, yearlyQuota: null, isPaid: true }).returning();
    const request = await createLeaveRequest(db, { employeeId: a.id, leaveTypeId: type.id, fromDate: may(20), toDate: may(21) }, userId);
    if (!request.ok) throw new Error(request.error);
    pendingLeaveId = request.requestId;
  });
  afterAll(() => close());

  it("makes the draft, with the 6th and the 7th absent", async () => {
    const result = await createDraftRun(db, MONTH, userId, { today: AFTER });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    runId = result.runId;
    const row = (await loadPayrollSheet(db, MONTH))!.rows.find((r) => r.employeeId === a.id)!;
    // A day is 30000 / 21. Two absent days cost 2857.14, so net is 27142.86, which is 27143.
    expect(row).toMatchObject({ absentDays: 2, deductions: "2857.14", net: "27143.00" });
  });

  it("finalizes: refreshes the sheet one last time, keeps a snapshot, and records who and when", async () => {
    // A punch for the 6th arrives after the draft was made. Finalizing picks it up.
    await savePunches(db, [punch(a.code, 6, "08:55")]);

    const result = await finalizeRun(db, runId, userId, { today: AFTER });
    expect(result.ok).toBe(true);

    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
    expect(run).toMatchObject({ status: "finalized", version: 1, finalizedBy: userId });
    expect(run.finalizedAt).toBeInstanceOf(Date);
    expect(run.ruleSetSnapshot).toMatchObject({
      month: MONTH,
      version: 1,
      weeklyOffDays: [5, 6],
      workingDays: 21,
      ruleSet: { effectiveFromMonth: "2010-01", lateMode: "days_per_lates", lateEveryN: 3, deductionBase: "gross", divisor: "working_days" },
    });

    // One absent day left: 30000 - 1428.57 = 28571.43, so 28571.
    const sheet = (await loadPayrollSheet(db, MONTH))!;
    expect(sheet.run).toMatchObject({ status: "finalized", finalizedByName: "Owner tester" });
    expect(sheet.rows.find((r) => r.employeeId === a.id)).toMatchObject({ absentDays: 1, net: "28571.00" });

    const trail = await db.select().from(auditLog).where(and(eq(auditLog.entityId, runId), eq(auditLog.action, "payroll_run.finalize")));
    expect(trail).toHaveLength(1);
    expect(trail[0].actorId).toBe(userId);
    // The entry shows what changed, in the same shape before and after.
    expect(trail[0].before).toEqual({ month: MONTH, status: "draft", version: 1 });
    expect(trail[0].after).toMatchObject({ month: MONTH, status: "finalized", version: 1, employees: expect.any(Number) });
  });

  it("cannot be finalized twice, or recomputed, or given bonuses and advances", async () => {
    expect(await finalizeRun(db, runId, userId, { today: AFTER })).toEqual({ ok: false, error: "This month is already finalized." });
    expect(await recomputeRun(db, runId, userId, { today: AFTER })).toEqual({ ok: false, error: "This month is finalized. Unlock it to change it." });
    expect(await addPayrollAdjustment(db, { employeeId: a.id, month: MONTH, type: "bonus", amount: "100" }, userId, { today: AFTER })).toMatchObject({
      ok: false,
      error: expect.stringContaining("finalized"),
    });
    expect(await removePayrollAdjustment(db, "00000000-0000-4000-8000-000000000000", userId)).toMatchObject({ ok: false });
  });

  it("leaves the month's attendance exactly as it was when something later changes", async () => {
    expect(await statusOn(a.id, may(7))).toBe("absent");
    // A punch for the 7th turns up after finalizing, and everything is recalculated.
    await savePunches(db, [punch(a.code, 7, "08:55")]);
    const summary = await recalc(db, { employeeIds: [a.id], from: may(1), to: may(31) });
    expect(summary.days).toBe(0);
    expect(await statusOn(a.id, may(7))).toBe("absent");
    const [row] = await db.select().from(payrollItems).where(and(eq(payrollItems.runId, runId), eq(payrollItems.employeeId, a.id)));
    expect(row.net).toBe("28571.00");
  });

  it("refuses a manual attendance fix in the month", async () => {
    const result = await addAdjustment(db, { employeeId: a.id, date: may(7), field: "status", value: "present", reason: "Forgot to punch" }, userId, AFTER);
    expect(result).toEqual({
      ok: false,
      error: "Payroll for May 2014 is finalized, so attendance for that day cannot be changed. Ask the owner to unlock the month first.",
    });
    expect(await statusOn(a.id, may(7))).toBe("absent");
  });

  it("refuses to record, approve or cancel leave in the month", async () => {
    const [type] = await db.select().from(leaveTypes).where(eq(leaveTypes.name, `Fin ${a.code}`));
    const created = await createLeaveRequest(db, { employeeId: a.id, leaveTypeId: type.id, fromDate: may(25), toDate: may(26) }, userId);
    expect(created).toMatchObject({ ok: false, error: expect.stringContaining("Payroll for May 2014 is finalized") });

    // A request that spills into the month is refused too.
    const spill = await createLeaveRequest(db, { employeeId: a.id, leaveTypeId: type.id, fromDate: "2014-04-29", toDate: may(2) }, userId);
    expect(spill).toMatchObject({ ok: false });

    const decided = await decideLeave(db, pendingLeaveId, "approve", userId, { today: AFTER });
    expect(decided).toMatchObject({ ok: false, error: expect.stringContaining("Payroll for May 2014 is finalized") });
    const [request] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, pendingLeaveId));
    expect(request.status).toBe("pending");
    expect(await statusOn(a.id, may(20))).toBe("present");
  });

  it("does not touch other months", async () => {
    const [type] = await db.select().from(leaveTypes).where(eq(leaveTypes.name, `Fin ${a.code}`));
    const june = await createLeaveRequest(db, { employeeId: a.id, leaveTypeId: type.id, fromDate: "2014-06-02", toDate: "2014-06-03" }, userId);
    expect(june.ok).toBe(true);
    expect(await addAdjustment(db, { employeeId: a.id, date: "2014-06-02", field: "status", value: "present", reason: "Checked by hand" }, userId, AFTER)).toEqual({ ok: true });
    expect(await addPayrollAdjustment(db, { employeeId: a.id, month: "2014-06", type: "bonus", amount: "100" }, userId, { today: AFTER })).toMatchObject({ ok: true });
  });

  it("lets only one of two finalize clicks at the same moment win", async () => {
    const result = await createDraftRun(db, "2014-06", userId, { today: "2014-07-05" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first, second] = await Promise.all([
      finalizeRun(db, result.runId, userId, { today: "2014-07-05" }),
      finalizeRun(db, result.runId, userId, { today: "2014-07-05" }),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, result.runId));
    expect(run.status).toBe("finalized");
  });

  it("refuses to finalize a run with nothing to pay, and leaves it a draft", async () => {
    // Salaries in these tests start in 2013 or later, so in mid 2012 nobody has one.
    const month = "2012-06";
    await db.delete(payrollRuns).where(eq(payrollRuns.month, `${month}-01`));
    const empty = await createDraftRun(db, month, userId, { today: "2012-07-05" });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(await db.select().from(payrollItems).where(eq(payrollItems.runId, empty.runId))).toHaveLength(0);

    const result = await finalizeRun(db, empty.runId, userId, { today: "2012-07-05" });
    expect(result).toEqual({ ok: false, error: "There is nothing to pay for Jun 2012. Add salaries to the people who worked, then recompute." });
    const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, empty.runId));
    expect(run).toMatchObject({ status: "draft", ruleSetSnapshot: null, finalizedBy: null, finalizedAt: null });
  });

  it("refuses a run that no longer exists", async () => {
    expect(await finalizeRun(db, "00000000-0000-4000-8000-000000000000", userId)).toMatchObject({ ok: false, error: expect.stringContaining("no longer exists") });
  });
});
