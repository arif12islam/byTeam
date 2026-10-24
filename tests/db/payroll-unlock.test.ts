import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  attendanceDays,
  auditLog,
  companySettings,
  employees,
  leaveTypes,
  payrollAdjustments,
  payrollRuns,
  ruleSets,
  salaryStructures,
  shifts,
  users,
} from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { addAdjustment } from "@/lib/attendance/adjustments";
import { createLeaveRequest } from "@/lib/leave/requests";
import { addPayrollAdjustment } from "@/lib/payroll/adjustments";
import { createDraftRun, finalizeRun, loadPayrollSheet, recomputeRun, unlockRun } from "@/lib/payroll/runs";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// May 2015 begins on a Friday. With Friday and Saturday off it has 21 working days.
// Nothing else in the tests uses 2015.
const MONTH = "2015-05";
const FIRST = `${MONTH}-01`;
const AFTER = "2015-06-10";
const WORKING_DAYS = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28, 31];
const at = (day: number, time: string) => officeDateTimeToInstant(`${MONTH}-${String(day).padStart(2, "0")}`, time)!;
const may = (day: number) => `${MONTH}-${String(day).padStart(2, "0")}`;

describe.skipIf(!testDatabaseUrl)("unlocking payroll", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let ownerId: string;
  let a: { id: string; code: string };
  let runId: string;
  const serial = uniqueSerial("U");

  const punch = (day: number) => ({
    deviceSn: serial,
    empCode: a.code,
    punchedAt: at(day, "08:55"),
    statusCode: 0,
    verifyCode: 1,
    rawLine: `${a.code} ${day}`,
  });
  const statusOn = async (date: string) =>
    (await db.select({ status: attendanceDays.status }).from(attendanceDays).where(and(eq(attendanceDays.employeeId, a.id), eq(attendanceDays.date, date))))[0]?.status;
  const rowA = async () => (await loadPayrollSheet(db, MONTH))!.rows.find((r) => r.employeeId === a.id)!;
  const runRow = async () => (await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)))[0];

  beforeAll(async () => {
    ({ db, close } = connect());
    ownerId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: ownerId, name: "Unlock owner", email: `${ownerId}@example.test`, role: "owner" });
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    await db.delete(payrollRuns).where(eq(payrollRuns.month, FIRST));
    await db.delete(payrollAdjustments).where(eq(payrollAdjustments.month, FIRST));
    await db
      .insert(ruleSets)
      .values({ effectiveFromMonth: "2010-01-01", lateMode: "days_per_lates", lateEveryN: 3, deductionBase: "gross", divisor: "working_days", createdBy: ownerId })
      .onConflictDoUpdate({
        target: ruleSets.effectiveFromMonth,
        set: { lateMode: "days_per_lates", lateEveryN: 3, lateAmount: null, deductionBase: "gross", divisor: "working_days", unpaidLeaveAsAbsent: true },
      });
    await addTestDevice(db, serial);

    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Unlock ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `Unlock ${code}`, joinDate: "2000-01-01", shiftId: shift.id }).returning();
    await db.insert(salaryStructures).values({
      employeeId: employee.id,
      gross: "30000.00",
      basicPct: "50",
      housePct: "20",
      medicalPct: "10",
      conveyancePct: "10",
      effectiveFrom: "2015-01-01",
    });
    a = { id: employee.id, code };
    // Present every working day except the 3rd.
    await savePunches(db, WORKING_DAYS.filter((d) => d !== 3).map(punch));

    const draft = await createDraftRun(db, MONTH, ownerId, { today: AFTER });
    if (!draft.ok) throw new Error(draft.error);
    runId = draft.runId;
    const finalized = await finalizeRun(db, runId, ownerId, { today: AFTER });
    if (!finalized.ok) throw new Error(finalized.error);
  });
  afterAll(() => close());

  it("starts finalized, with the 3rd absent: 30000 less one day of 1428.57 is 28571", async () => {
    expect(await runRow()).toMatchObject({ status: "finalized", version: 1 });
    expect(await rowA()).toMatchObject({ absentDays: 1, net: "28571.00" });
  });

  it("needs a reason", async () => {
    for (const reason of ["", "  ", "ab", "x".repeat(501)]) {
      expect(await unlockRun(db, runId, reason, ownerId), JSON.stringify(reason.slice(0, 5))).toMatchObject({ ok: false });
    }
    expect(await unlockRun(db, runId, "", ownerId)).toEqual({ ok: false, error: "Say why you are unlocking this month, in a few words." });
    expect((await runRow()).status).toBe("finalized");
  });

  it("stays locked until someone unlocks it: a punch that arrives now does not change the month", async () => {
    await savePunches(db, [punch(3)]);
    expect(await recomputeRun(db, runId, ownerId, { today: AFTER })).toMatchObject({ ok: false });
    expect(await statusOn(may(3))).toBe("absent");
  });

  it("unlocks with a reason: back to a draft, version 2, snapshot and finalizer cleared, the items kept", async () => {
    const result = await unlockRun(db, runId, "  A punch for the 3rd was missing  ", ownerId);
    expect(result).toEqual({ ok: true, version: 2 });

    expect(await runRow()).toMatchObject({ status: "draft", version: 2, ruleSetSnapshot: null, finalizedBy: null, finalizedAt: null });
    // Nothing is recomputed yet: the sheet still shows what was finalized.
    expect(await rowA()).toMatchObject({ absentDays: 1, net: "28571.00" });

    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, runId), eq(auditLog.action, "payroll_run.unlock")));
    expect(entry.actorId).toBe(ownerId);
    expect(entry.after).toMatchObject({ reason: "A punch for the 3rd was missing", status: "draft", version: 2 });
    expect(entry.before).toMatchObject({ status: "finalized", version: 1 });
    expect((entry.before as { ruleSetSnapshot: { workingDays: number } }).ruleSetSnapshot.workingDays).toBe(21);
  });

  it("cannot be unlocked when it is not finalized", async () => {
    expect(await unlockRun(db, runId, "Trying again", ownerId)).toEqual({ ok: false, error: "This month is not finalized, so there is nothing to unlock." });
    expect((await runRow()).version).toBe(2);
    expect(await unlockRun(db, "00000000-0000-4000-8000-000000000000", "No such run", ownerId)).toMatchObject({ ok: false, error: expect.stringContaining("no longer exists") });
  });

  it("opens everything that was locked", async () => {
    // Leave and a manual attendance fix and a bonus all work again.
    const [type] = await db.insert(leaveTypes).values({ name: `Unlock ${a.code}`, yearlyQuota: null, isPaid: true }).returning();
    expect(await createLeaveRequest(db, { employeeId: a.id, leaveTypeId: type.id, fromDate: may(24), toDate: may(24) }, ownerId)).toMatchObject({ ok: true });
    expect(await addAdjustment(db, { employeeId: a.id, date: may(4), field: "status", value: "present", reason: "Checked on the camera" }, ownerId, AFTER)).toEqual({ ok: true });
    expect(await addPayrollAdjustment(db, { employeeId: a.id, month: MONTH, type: "bonus", amount: "500" }, ownerId, { today: AFTER })).toMatchObject({ ok: true });

    // The punch for the 3rd, ignored while locked, is used by the recompute that the bonus triggered.
    expect(await statusOn(may(3))).toBe("present");
    expect(await rowA()).toMatchObject({ absentDays: 0, additions: "500.00", net: "30500.00" });
  });

  it("finalizes again as version 2, and can be unlocked a second time", async () => {
    expect(await finalizeRun(db, runId, ownerId, { today: AFTER })).toMatchObject({ ok: true });
    expect(await runRow()).toMatchObject({ status: "finalized", version: 2 });
    expect((await runRow()).ruleSetSnapshot).toMatchObject({ version: 2 });

    expect(await unlockRun(db, runId, "One more check", ownerId)).toEqual({ ok: true, version: 3 });
    const entries = await db.select().from(auditLog).where(and(eq(auditLog.entityId, runId), eq(auditLog.action, "payroll_run.unlock")));
    expect(entries).toHaveLength(2);
  });

  it("lets only one of two unlock clicks at the same moment win", async () => {
    expect(await finalizeRun(db, runId, ownerId, { today: AFTER })).toMatchObject({ ok: true });
    const [first, second] = await Promise.all([unlockRun(db, runId, "Click one", ownerId), unlockRun(db, runId, "Click two", ownerId)]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect((await runRow()).version).toBe(4);
  });
});
