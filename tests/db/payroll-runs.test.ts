import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditLog,
  companySettings,
  employees,
  holidays,
  payrollAdjustments,
  payrollItems,
  payrollRuns,
  ruleSets,
  salaryStructures,
  shifts,
  users,
} from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { addPayrollAdjustment, removePayrollAdjustment } from "@/lib/payroll/adjustments";
import { createDraftRun, listPayrollRuns, loadPayrollSheet, recomputeRun, sumMoney } from "@/lib/payroll/runs";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// May 2013 begins on a Wednesday. With Friday and Saturday off it has 22 working days, and the
// 14th (a Tuesday) is made a holiday here, so 21. Nothing else in the tests uses 2013.
const MONTH = "2013-05";
const FIRST = `${MONTH}-01`;
const HOLIDAY = `${MONTH}-14`;
const AFTER = "2013-06-10"; // "today" for these tests: the month is over
const NO_RULES_MONTH = "2009-06"; // before the rules these tests add

const WORKING_DAYS = [1, 2, 5, 6, 7, 8, 9, 12, 13, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30]; // without the holiday
const at = (day: number, time: string) => officeDateTimeToInstant(`${MONTH}-${String(day).padStart(2, "0")}`, time)!;

describe.skipIf(!testDatabaseUrl)("payroll runs", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;
  let a: { id: string; code: string };
  let b: { id: string; code: string };
  let c: { id: string; code: string };
  let runId: string;
  const serial = uniqueSerial("P");

  async function person(name: string, join: string, salary: { gross: string; basicPct: string } | null) {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Pay ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `${name} ${code}`, joinDate: join, shiftId: shift.id }).returning();
    if (salary) {
      await db.insert(salaryStructures).values({
        employeeId: employee.id,
        gross: salary.gross,
        basicPct: salary.basicPct,
        housePct: "20",
        medicalPct: "10",
        conveyancePct: "10",
        effectiveFrom: "2013-01-01",
      });
    }
    return { id: employee.id, code };
  }

  const punch = (code: string, day: number, time: string) => ({
    deviceSn: serial,
    empCode: code,
    punchedAt: at(day, time),
    statusCode: 0,
    verifyCode: 1,
    rawLine: `${code} ${day} ${time}`,
  });

  const rowOf = async (employeeId: string) => (await loadPayrollSheet(db, MONTH))!.rows.find((r) => r.employeeId === employeeId)!;

  beforeAll(async () => {
    ({ db, close } = connect());
    userId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Payroll tester", email: `${userId}@example.test`, role: "owner" });

    // The state these months need, safe to repeat when the database is reused.
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    await db.delete(payrollRuns).where(inArray(payrollRuns.month, [FIRST, `${NO_RULES_MONTH}-01`]));
    await db.delete(payrollAdjustments).where(eq(payrollAdjustments.month, FIRST));
    await db.delete(holidays).where(eq(holidays.date, HOLIDAY));
    await db.insert(holidays).values({ date: HOLIDAY, name: "Test holiday" });
    await db
      .insert(ruleSets)
      .values({ effectiveFromMonth: "2010-01-01", lateMode: "days_per_lates", lateEveryN: 3, deductionBase: "gross", divisor: "working_days", createdBy: userId })
      .onConflictDoUpdate({
        target: ruleSets.effectiveFromMonth,
        set: { lateMode: "days_per_lates", lateEveryN: 3, lateAmount: null, deductionBase: "gross", divisor: "working_days", unpaidLeaveAsAbsent: true },
      });
    await addTestDevice(db, serial);

    // A: a full month. Absent on the 6th, late on the 7th, 8th and 9th, present otherwise.
    a = await person("Full month", "2000-01-01", { gross: "30000.00", basicPct: "50" });
    // B: joined on the 20th. Absent on the 22nd.
    b = await person("Joiner", `${MONTH}-20`, { gross: "24000.00", basicPct: "60" });
    // C: no salary set.
    c = await person("No salary", "2000-01-01", null);

    const punches = [];
    for (const day of WORKING_DAYS) {
      if (day !== 6) punches.push(punch(a.code, day, [7, 8, 9].includes(day) ? "09:30" : "08:55"));
      if (day >= 20 && day !== 22) punches.push(punch(b.code, day, "08:50"));
    }
    await savePunches(db, punches);
  });
  afterAll(async () => {
    await db.delete(holidays).where(eq(holidays.date, HOLIDAY));
    await close();
  });

  it("makes a draft run with one item for everyone who has a salary, worked out by hand", async () => {
    const result = await createDraftRun(db, MONTH, userId, { today: AFTER });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    runId = result.runId;

    const sheet = (await loadPayrollSheet(db, MONTH))!;
    expect(sheet.run).toMatchObject({ id: runId, month: MONTH, status: "draft", version: 1 });

    // A: a day is 30000 / 21 = 1428.57. One absent day and 3 lates (one day) cost 2857.14. Net 27142.86, so 27143.
    const rowA = sheet.rows.find((r) => r.employeeId === a.id)!;
    expect(rowA).toMatchObject({ payableDays: 31, absentDays: 1, lateCount: 3, unpaidLeaveDays: 0, gross: "30000.00", deductions: "2857.14", additions: "0.00", net: "27143.00" });
    expect(rowA.lines.map((l) => l.code)).toEqual(["salary", "absent", "late"]);

    // B: 12 of 31 days = 9290.32. One absent day costs 24000 / 21 = 1142.86. Net 8147.46, so 8147.
    const rowB = sheet.rows.find((r) => r.employeeId === b.id)!;
    expect(rowB).toMatchObject({ payableDays: 12, absentDays: 1, lateCount: 0, gross: "9290.32", deductions: "1142.86", net: "8147.00" });

    // C has no salary, so is listed as not paid instead of getting an item.
    expect(sheet.rows.some((r) => r.employeeId === c.id)).toBe(false);
    expect(sheet.skipped.map((s) => s.employeeId)).toContain(c.id);

    expect(sheet.totals.net).toBe(sumMoney(sheet.rows.map((r) => r.net)));
    expect(sheet.notices).toEqual([]);

    const trail = await db.select().from(auditLog).where(eq(auditLog.entityId, runId));
    expect(trail.map((t) => t.action).sort()).toEqual(["payroll_run.create", "payroll_run.recompute"]);
  });

  it("lists the run with its totals", async () => {
    const runs = await listPayrollRuns(db);
    const mine = runs.find((r) => r.id === runId)!;
    expect(mine).toMatchObject({ month: MONTH, status: "draft" });
    expect(mine.employees).toBeGreaterThanOrEqual(2);
    expect(mine.net).toBe((await loadPayrollSheet(db, MONTH))!.totals.net);
  });

  it("refuses a second run for the same month, a month that has not started, and a month with no rules", async () => {
    expect(await createDraftRun(db, MONTH, userId, { today: AFTER })).toEqual({ ok: false, error: "There is already a payroll run for May 2013." });
    expect(await createDraftRun(db, "2013-07", userId, { today: AFTER })).toMatchObject({ ok: false, error: expect.stringContaining("has not started") });
    expect(await createDraftRun(db, "May", userId, { today: AFTER })).toMatchObject({ ok: false });
    const noRules = await createDraftRun(db, NO_RULES_MONTH, userId, { today: AFTER });
    expect(noRules).toMatchObject({ ok: false, error: expect.stringContaining("No pay rules apply to Jun 2009") });
    // Nothing was left behind for the month without rules.
    expect(await db.select().from(payrollRuns).where(eq(payrollRuns.month, `${NO_RULES_MONTH}-01`))).toHaveLength(0);
  });

  it("recomputes to the same sheet and writes an audit row each time", async () => {
    const before = (await loadPayrollSheet(db, MONTH))!.rows.map((r) => [r.employeeId, r.net]);
    const result = await recomputeRun(db, runId, userId, { today: AFTER });
    expect(result).toMatchObject({ ok: true });
    expect((await loadPayrollSheet(db, MONTH))!.rows.map((r) => [r.employeeId, r.net])).toEqual(before);
    const items = await db.select().from(payrollItems).where(eq(payrollItems.runId, runId));
    expect(new Set(items.map((i) => i.employeeId)).size).toBe(items.length); // still one item each
    const recomputes = (await db.select().from(auditLog).where(eq(auditLog.entityId, runId))).filter((t) => t.action === "payroll_run.recompute");
    expect(recomputes.length).toBeGreaterThanOrEqual(2);
  });

  it("adds a bonus and an advance, updates the sheet by itself, and takes them away again", async () => {
    const bonus = await addPayrollAdjustment(db, { employeeId: a.id, month: MONTH, type: "bonus", amount: "500", note: "Eid" }, userId, { today: AFTER });
    const advance = await addPayrollAdjustment(db, { employeeId: a.id, month: MONTH, type: "advance", amount: "1,000.00", note: "" }, userId, { today: AFTER });
    expect(bonus.ok && advance.ok).toBe(true);
    if (!bonus.ok || !advance.ok) return;

    // 30000 - 2857.14 - 1000 + 500 = 26642.86, so 26643.
    expect(await rowOf(a.id)).toMatchObject({ deductions: "3857.14", additions: "500.00", net: "26643.00" });
    expect(await rowOf(b.id)).toMatchObject({ net: "8147.00" }); // others untouched

    const sheet = (await loadPayrollSheet(db, MONTH))!;
    expect(sheet.adjustments.filter((x) => x.employeeId === a.id).map((x) => [x.type, x.amount, x.note])).toEqual([
      ["bonus", "500.00", "Eid"],
      ["advance", "1000.00", null],
    ]);

    expect(await removePayrollAdjustment(db, bonus.id, userId, { today: AFTER })).toEqual({ ok: true });
    expect(await removePayrollAdjustment(db, advance.id, userId, { today: AFTER })).toEqual({ ok: true });
    expect(await rowOf(a.id)).toMatchObject({ deductions: "2857.14", additions: "0.00", net: "27143.00" });
    expect(await removePayrollAdjustment(db, advance.id, userId, { today: AFTER })).toMatchObject({ ok: false });

    const trail = await db.select().from(auditLog).where(inArray(auditLog.entityId, [bonus.id, advance.id]));
    expect(trail.map((t) => t.action).sort()).toEqual(["payroll_adjustment.create", "payroll_adjustment.create", "payroll_adjustment.delete", "payroll_adjustment.delete"]);
  });

  it("refuses bad amounts and people who were not employed that month", async () => {
    const base = { employeeId: a.id, month: MONTH, type: "bonus" as const, amount: "100" };
    for (const amount of ["0", "-5", "abc", "1.234", ""]) {
      expect(await addPayrollAdjustment(db, { ...base, amount }, userId, { today: AFTER }), amount).toMatchObject({ ok: false });
    }
    expect(await addPayrollAdjustment(db, { ...base, type: "tip" as "bonus" }, userId, { today: AFTER })).toMatchObject({ ok: false });
    // B joined on 20 May, so April is before B's time.
    expect(await addPayrollAdjustment(db, { ...base, employeeId: b.id, month: "2013-04" }, userId, { today: AFTER })).toEqual({
      ok: false,
      error: "That person was not employed in Apr 2013.",
    });
    expect(await db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.employeeId, a.id), eq(payrollAdjustments.month, FIRST)))).toHaveLength(0);
  });

  it("keeps a bonus for a month with no run yet, and uses it when the run is made", async () => {
    const june = "2013-06";
    const saved = await addPayrollAdjustment(db, { employeeId: a.id, month: june, type: "bonus", amount: "250" }, userId, { today: AFTER });
    expect(saved.ok).toBe(true);
    await db.delete(payrollRuns).where(eq(payrollRuns.month, `${june}-01`));
    const run = await createDraftRun(db, june, userId, { today: "2013-07-05" });
    expect(run.ok).toBe(true);
    const sheet = (await loadPayrollSheet(db, june))!;
    expect(sheet.rows.find((r) => r.employeeId === a.id)).toMatchObject({ additions: "250.00" });
  });

  it("refuses to change anything while the month is finalized", async () => {
    await db.update(payrollRuns).set({ status: "finalized", ruleSetSnapshot: { test: true }, finalizedBy: userId, finalizedAt: new Date() }).where(eq(payrollRuns.id, runId));
    try {
      const netBefore = (await rowOf(a.id)).net;
      expect(await recomputeRun(db, runId, userId, { today: AFTER })).toEqual({ ok: false, error: "This month is finalized. Unlock it to change it." });
      const add = await addPayrollAdjustment(db, { employeeId: a.id, month: MONTH, type: "bonus", amount: "100" }, userId, { today: AFTER });
      expect(add).toMatchObject({ ok: false, error: expect.stringContaining("finalized") });

      // An amount that already exists cannot be removed either.
      const [existing] = await db.insert(payrollAdjustments).values({ employeeId: a.id, month: FIRST, type: "bonus", amount: "100", createdBy: userId }).returning();
      expect(await removePayrollAdjustment(db, existing.id, userId, { today: AFTER })).toMatchObject({ ok: false, error: expect.stringContaining("finalized") });
      expect(await db.select().from(payrollAdjustments).where(eq(payrollAdjustments.id, existing.id))).toHaveLength(1);
      await db.delete(payrollAdjustments).where(eq(payrollAdjustments.id, existing.id));

      expect((await rowOf(a.id)).net).toBe(netBefore);
    } finally {
      await db.update(payrollRuns).set({ status: "draft", ruleSetSnapshot: null, finalizedBy: null, finalizedAt: null }).where(eq(payrollRuns.id, runId));
    }
  });

  it("picks up a punch that arrived after the draft was made", async () => {
    expect((await rowOf(a.id)).absentDays).toBe(1);
    await savePunches(db, [punch(a.code, 6, "08:55")]);
    const result = await recomputeRun(db, runId, userId, { today: AFTER });
    expect(result).toMatchObject({ ok: true });
    // The absent day is gone: 30000 - 1428.57 (one late day) = 28571.43, so 28571.
    expect(await rowOf(a.id)).toMatchObject({ absentDays: 0, deductions: "1428.57", net: "28571.00" });
  });
});
