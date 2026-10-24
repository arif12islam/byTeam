import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { companySettings, employees, payrollAdjustments, payrollRuns, ruleSets, salaryStructures, shifts, users } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { loadPayslips } from "@/lib/payroll/payslip";
import { createDraftRun, finalizeRun, loadPayrollSheet } from "@/lib/payroll/runs";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// May 2016 begins on a Sunday. With Friday and Saturday off it has 23 working days.
// Nothing else in the tests uses 2016.
const MONTH = "2016-05";
const FIRST = `${MONTH}-01`;
const AFTER = "2016-06-10";
const WORKING_DAYS = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 29, 30, 31];
const at = (day: number, time: string) => officeDateTimeToInstant(`${MONTH}-${String(day).padStart(2, "0")}`, time)!;

describe.skipIf(!testDatabaseUrl)("payslips", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let ownerId: string;
  let a: { id: string; code: string };
  let b: { id: string; code: string };
  let runId: string;
  const serial = uniqueSerial("S");

  async function person(name: string, designation: string | null) {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Slip ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db
      .insert(employees)
      .values({ empCode: code, name: `${name} ${code}`, department: "Sales", designation, joinDate: "2000-01-01", shiftId: shift.id })
      .returning();
    await db.insert(salaryStructures).values({
      employeeId: employee.id,
      gross: "30000.00",
      basicPct: "50",
      housePct: "20",
      medicalPct: "10",
      conveyancePct: "10",
      effectiveFrom: "2016-01-01",
    });
    return { id: employee.id, code };
  }
  const punch = (code: string, day: number) => ({
    deviceSn: serial,
    empCode: code,
    punchedAt: at(day, "08:55"),
    statusCode: 0,
    verifyCode: 1,
    rawLine: `${code} ${day}`,
  });

  beforeAll(async () => {
    ({ db, close } = connect());
    ownerId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: ownerId, name: "Slip owner", email: `${ownerId}@example.test`, role: "owner" });
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

    a = await person("Slip A", "Executive");
    b = await person("Slip B", null);
    // A is present every working day but the 2nd. B is present every working day.
    await savePunches(db, [...WORKING_DAYS.filter((d) => d !== 2).map((d) => punch(a.code, d)), ...WORKING_DAYS.map((d) => punch(b.code, d))]);
  });
  afterAll(() => close());

  it("has no payslips when there is no run, or the run is still a draft", async () => {
    expect(await loadPayslips(db, MONTH)).toEqual({ ok: false, error: "There is no payroll run for May 2016.", status: 404 });

    const draft = await createDraftRun(db, MONTH, ownerId, { today: AFTER });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    runId = draft.runId;
    expect(await loadPayslips(db, MONTH, a.id)).toEqual({ ok: false, error: "May 2016 is still a draft. Finalize it to get payslips.", status: 409 });
  });

  it("gives one payslip that matches the finalized sheet to the paisa", async () => {
    expect(await finalizeRun(db, runId, ownerId, { today: AFTER })).toMatchObject({ ok: true });

    const result = await loadPayslips(db, MONTH, a.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slips).toHaveLength(1);
    const [slip] = result.slips;

    const row = (await loadPayrollSheet(db, MONTH))!.rows.find((r) => r.employeeId === a.id)!;
    expect(slip.net).toBe(row.net);
    expect(slip.lines).toEqual(row.lines);
    // A day is 30000 / 23 = 1304.35. One absent day: 30000 - 1304.35 = 28695.65, so 28696.
    expect(slip.net).toBe("28696.00");
    expect(slip).toMatchObject({
      company: "Test company",
      month: MONTH,
      version: 1,
      days: { inMonth: 31, paid: 31, absent: 1, late: 0, unpaidLeave: 0 },
      employee: { empCode: a.code, department: "Sales", designation: "Executive" },
    });
    expect(slip.finalizedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("gives everyone's payslips when no employee is named, in code order", async () => {
    const result = await loadPayslips(db, MONTH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const mine = result.slips.filter((s) => [a.code, b.code].includes(s.employee.empCode));
    expect(mine.map((s) => [s.employee.empCode, s.net])).toEqual(
      [
        [a.code, "28696.00"],
        [b.code, "30000.00"],
      ].sort((x, y) => x[0].localeCompare(y[0], undefined, { numeric: true })),
    );
    expect(mine.find((s) => s.employee.empCode === b.code)?.employee.designation).toBeNull();
  });

  it("says so when the person has no payslip that month", async () => {
    expect(await loadPayslips(db, MONTH, "00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      error: "That person has no payslip for May 2016.",
      status: 404,
    });
  });

  it("does not change when something happens after finalizing", async () => {
    // A punch for the 2nd arrives late. The month is locked, so the payslip stays what the owner approved.
    await savePunches(db, [punch(a.code, 2)]);
    const result = await loadPayslips(db, MONTH, a.id);
    expect(result.ok && result.slips[0].net).toBe("28696.00");
  });
});
