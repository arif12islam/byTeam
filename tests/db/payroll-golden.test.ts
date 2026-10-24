import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companySettings, employees, payrollAdjustments, payrollRuns, ruleSets, users } from "@/db/schema";
import { addAdjustment } from "@/lib/attendance/adjustments";
import { buildDemoPlan, DEMO_EMPLOYEE_COUNT, type DemoPlan } from "@/lib/demo/scenarios";
import { applyDemoPlan } from "@/lib/demo/seed";
import { addPayrollAdjustment } from "@/lib/payroll/adjustments";
import { loadPayslips } from "@/lib/payroll/payslip";
import { createDraftRun, finalizeRun, loadPayrollSheet, recomputeRun } from "@/lib/payroll/runs";

import { connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

type Pay = {
  monthlyGross: string;
  payableDays: number;
  absentDays: number;
  lateCount: number;
  unpaidLeaveDays: number;
  lateDaysDeducted: number;
  grossEarned: string;
  absentDeduction: string;
  unpaidLeaveDeduction: string;
  lateDeduction: string;
  advance: string;
  bonus: string;
  deductions: string;
  additions: string;
  netBeforeRounding: string;
  net: string;
};
type Fixture = { key: string; name: string; story: string; pay: Pay };

// May 2017, not the March the grid test uses: this test finalizes its month, and a finalized month refuses new leave and bonuses.
const MONTH = "2017-05";
const TODAY = "2017-06-05";
const DIR = path.join(__dirname, "..", "fixtures", "demo", MONTH);
const fixtures: Fixture[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Fixture);

/** The expected-pay.csv "spreadsheet", one object per row. */
function readSpreadsheet() {
  const [header, ...rows] = readFileSync(path.join(DIR, "expected-pay.csv"), "utf8").trim().split(/\r?\n/);
  const columns = header.split(",");
  return rows.map((row) => Object.fromEntries(row.split(",").map((cell, i) => [columns[i], cell])));
}

describe("the pay spreadsheet and the fixtures", () => {
  it("agree with each other, one row per person", () => {
    const sheet = readSpreadsheet();
    expect(sheet.map((r) => r.key).sort()).toEqual(fixtures.map((f) => f.key).sort());
    for (const f of fixtures) {
      const row = sheet.find((r) => r.key === f.key)!;
      expect(row, f.key).toMatchObject({
        name: f.name,
        monthly_gross: f.pay.monthlyGross,
        payable_days: String(f.pay.payableDays),
        absent_days: String(f.pay.absentDays),
        late_count: String(f.pay.lateCount),
        unpaid_leave_days: String(f.pay.unpaidLeaveDays),
        gross_earned: f.pay.grossEarned,
        deductions: f.pay.deductions,
        additions: f.pay.additions,
        net_before_rounding: f.pay.netBeforeRounding,
        net: f.pay.net,
      });
    }
  });
});

describe.skipIf(!testDatabaseUrl)("golden pay: every demo employee's net pay matches the spreadsheet to the taka", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actorId: string;
  let plan: DemoPlan;
  let idByKey: Map<string, string>;
  let runId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    actorId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: actorId, name: "Golden owner", email: `${actorId}@example.test`, role: "owner" });
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    // The office rules: gross, working days, every 3 lates cost a day, unpaid leave deducted.
    await db
      .insert(ruleSets)
      .values({ effectiveFromMonth: "2010-01-01", lateMode: "days_per_lates", lateEveryN: 3, deductionBase: "gross", divisor: "working_days", createdBy: actorId })
      .onConflictDoUpdate({
        target: ruleSets.effectiveFromMonth,
        set: { lateMode: "days_per_lates", lateEveryN: 3, lateAmount: null, deductionBase: "gross", divisor: "working_days", unpaidLeaveAsAbsent: true },
      });
    await db.delete(payrollRuns).where(eq(payrollRuns.month, `${MONTH}-01`));

    const codes = Array.from({ length: DEMO_EMPLOYEE_COUNT }, () => uniqueCode());
    plan = buildDemoPlan(MONTH, [5, 6], codes);
    const id = uniqueCode();
    await applyDemoPlan(db, plan, {
      actorId,
      deviceSerial: uniqueSerial("P"),
      today: TODAY,
      names: { shift: `Golden shift ${id}`, paidLeave: `Golden casual ${id}`, unpaidLeave: `Golden unpaid ${id}` },
    });
    const rows = await db.select({ id: employees.id, empCode: employees.empCode }).from(employees).where(inArray(employees.empCode, codes));
    idByKey = new Map(plan.employees.map((p) => [p.key, rows.find((r) => r.empCode === p.empCode)!.id]));

    const run = await createDraftRun(db, MONTH, actorId, { today: TODAY });
    if (!run.ok) throw new Error(run.error);
    runId = run.runId;
  }, 120_000);
  afterAll(() => close());

  const rowOf = async (key: string) => (await loadPayrollSheet(db, MONTH))!.rows.find((r) => r.employeeId === idByKey.get(key))!;

  describe.each(fixtures.map((f) => [f.key, f] as const))("%s", (_key, fixture) => {
    it("gets the expected counts, money lines and net pay", async () => {
      const row = await rowOf(fixture.key);
      const { pay } = fixture;
      expect(row, fixture.story).toBeDefined();
      expect({ days: row.payableDays, absent: row.absentDays, late: row.lateCount, unpaid: row.unpaidLeaveDays }).toEqual({
        days: pay.payableDays,
        absent: pay.absentDays,
        late: pay.lateCount,
        unpaid: pay.unpaidLeaveDays,
      });
      expect({ gross: row.gross, deductions: row.deductions, additions: row.additions, net: row.net }).toEqual({
        gross: pay.grossEarned,
        deductions: pay.deductions,
        additions: pay.additions,
        net: pay.net,
      });

      // The breakdown shows each line, and the amount before rounding.
      const amountOf = (code: string) => row.lines.find((l) => l.code === code)?.amount ?? "0.00";
      expect(amountOf("salary")).toBe(pay.grossEarned);
      expect(amountOf("absent")).toBe(pay.absentDeduction);
      expect(amountOf("unpaid_leave")).toBe(pay.unpaidLeaveDeduction);
      expect(amountOf("late")).toBe(pay.lateDeduction);
      expect(amountOf("advance")).toBe(pay.advance);
      expect(amountOf("bonus")).toBe(pay.bonus);
      const [item] = (await db.query.payrollItems.findMany({ where: (t, { and, eq: same }) => and(same(t.runId, runId), same(t.employeeId, idByKey.get(fixture.key)!)) }));
      expect((item.breakdown as { netBeforeRounding: string; lateDaysDeducted: number }).netBeforeRounding).toBe(pay.netBeforeRounding);
      expect((item.breakdown as { lateDaysDeducted: number }).lateDaysDeducted).toBe(pay.lateDaysDeducted);
    });
  });

  it("matches the spreadsheet after finalizing too, on the payslips", async () => {
    expect(await finalizeRun(db, runId, actorId, { today: TODAY })).toMatchObject({ ok: true });
    const slips = await loadPayslips(db, MONTH);
    expect(slips.ok).toBe(true);
    if (!slips.ok) return;

    const sheet = readSpreadsheet();
    for (const planned of plan.employees) {
      const slip = slips.slips.find((s) => s.employee.empCode === planned.empCode)!;
      const expected = sheet.find((r) => r.key === planned.key)!;
      expect(slip.net, planned.key).toBe(expected.net);
      expect(slip.employee.name).toBe(expected.name);
    }
  });

  it("cannot be edited once finalized", async () => {
    const before = await rowOf("frequent_late");
    const id = idByKey.get("frequent_late")!;

    expect(await recomputeRun(db, runId, actorId, { today: TODAY })).toMatchObject({ ok: false });
    expect(await addPayrollAdjustment(db, { employeeId: id, month: MONTH, type: "bonus", amount: "100" }, actorId, { today: TODAY })).toMatchObject({ ok: false });
    expect(await addAdjustment(db, { employeeId: id, date: plan.workingDates[1], field: "status", value: "present", reason: "Checked on the camera" }, actorId, TODAY)).toMatchObject({
      ok: false,
    });
    expect(await db.select().from(payrollAdjustments).where(eq(payrollAdjustments.employeeId, id))).toHaveLength(0);
    expect((await rowOf("frequent_late")).net).toBe(before.net);
  });
});
