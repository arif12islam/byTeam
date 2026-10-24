import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { employees, payrollAdjustments, payrollItems, payrollRuns, ruleSets, shifts, users } from "@/db/schema";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

/** Drizzle wraps the database's message, so read the whole error chain. */
async function refusal(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause) messages.push(e.message);
    return messages.join(" | ");
  }
  return "";
}

describe.skipIf(!testDatabaseUrl)("payroll tables", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let employeeId: string;
  let userId: string;
  // Rows stay in the shared test database, and a month can hold only one rule set
  // or run. Each run starts from a random year far in the future and counts up.
  const baseYear = 3000 + Math.floor(Math.random() * 5000);
  let monthCounter = 0;
  const nextMonth = () => {
    const index = monthCounter++;
    return `${baseYear + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
  };

  beforeAll(async () => {
    ({ db, close } = connect());
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Test ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    const [employee] = await db
      .insert(employees)
      .values({ empCode: code, name: "Test Person", joinDate: "2026-01-01", shiftId: shift.id })
      .returning();
    employeeId = employee.id;
    userId = `test-user-${code}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "owner" });
  });
  afterAll(() => close());

  const rules = (over: Partial<typeof ruleSets.$inferInsert> = {}) => ({
    effectiveFromMonth: nextMonth(),
    deductionBase: "gross" as const,
    divisor: "working_days" as const,
    createdBy: userId,
    ...over,
  });

  describe("rule_sets", () => {
    it("saves a rule set with defaults", async () => {
      const [row] = await db.insert(ruleSets).values(rules()).returning();
      expect(row.lateMode).toBe("none");
      expect(row.unpaidLeaveAsAbsent).toBe(true);
    });

    it("accepts each late mode with its own number", async () => {
      await db.insert(ruleSets).values(rules({ lateMode: "days_per_lates", lateEveryN: 3 }));
      await db.insert(ruleSets).values(rules({ lateMode: "fixed_per_late", lateAmount: "50.00" }));
    });

    it("refuses a late mode without its number, or with the other number", async () => {
      expect(await refusal(db.insert(ruleSets).values(rules({ lateMode: "days_per_lates" })))).toContain("rule_sets_late_mode_fields");
      expect(await refusal(db.insert(ruleSets).values(rules({ lateMode: "fixed_per_late" })))).toContain("rule_sets_late_mode_fields");
      expect(await refusal(db.insert(ruleSets).values(rules({ lateMode: "none", lateEveryN: 3 })))).toContain("rule_sets_late_mode_fields");
      expect(
        await refusal(db.insert(ruleSets).values(rules({ lateMode: "days_per_lates", lateEveryN: 3, lateAmount: "10" }))),
      ).toContain("rule_sets_late_mode_fields");
    });

    it("refuses zero lates per day and negative amounts", async () => {
      expect(await refusal(db.insert(ruleSets).values(rules({ lateMode: "days_per_lates", lateEveryN: 0 })))).toContain(
        "rule_sets_every_n_positive",
      );
      expect(await refusal(db.insert(ruleSets).values(rules({ lateMode: "fixed_per_late", lateAmount: "-1" })))).toContain(
        "rule_sets_amount_not_negative",
      );
    });

    it("refuses a month that is not the first day, and a second rule set for the same month", async () => {
      expect(await refusal(db.insert(ruleSets).values(rules({ effectiveFromMonth: `${baseYear + 20}-03-15` })))).toContain("rule_sets_month_start");
      const month = nextMonth();
      await db.insert(ruleSets).values(rules({ effectiveFromMonth: month }));
      expect(await refusal(db.insert(ruleSets).values(rules({ effectiveFromMonth: month })))).toContain("rule_sets_effective_from_month_key");
    });
  });

  describe("payroll_runs and payroll_items", () => {
    const run = (over: Partial<typeof payrollRuns.$inferInsert> = {}) => ({ month: nextMonth(), createdBy: userId, ...over });
    const item = (runId: string, over: Partial<typeof payrollItems.$inferInsert> = {}) => ({
      runId,
      employeeId,
      payableDays: 30,
      gross: "30000.00",
      net: "30000.00",
      breakdown: { note: "test" },
      ...over,
    });

    it("starts as a draft with version 1", async () => {
      const [row] = await db.insert(payrollRuns).values(run()).returning();
      expect(row.status).toBe("draft");
      expect(row.version).toBe(1);
    });

    it("allows one run per month and only on the first day", async () => {
      const month = nextMonth();
      await db.insert(payrollRuns).values(run({ month }));
      expect(await refusal(db.insert(payrollRuns).values(run({ month })))).toContain("payroll_runs_month_key");
      expect(await refusal(db.insert(payrollRuns).values(run({ month: `${baseYear + 20}-04-02` })))).toContain("payroll_runs_month_start");
    });

    it("keeps the snapshot and finalizer together with the finalized status", async () => {
      const finalized = { status: "finalized" as const, ruleSetSnapshot: { divisor: "thirty" }, finalizedBy: userId, finalizedAt: new Date() };
      const [row] = await db.insert(payrollRuns).values(run(finalized)).returning();
      expect(row.status).toBe("finalized");
      // Finalized without a snapshot, or a draft that carries one, is refused.
      expect(await refusal(db.insert(payrollRuns).values(run({ ...finalized, ruleSetSnapshot: null })))).toContain(
        "payroll_runs_finalize_recorded",
      );
      expect(await refusal(db.insert(payrollRuns).values(run({ status: "draft", ruleSetSnapshot: { divisor: "thirty" } })))).toContain(
        "payroll_runs_finalize_recorded",
      );
    });

    it("saves one item per employee per run and removes items with their run", async () => {
      const [r] = await db.insert(payrollRuns).values(run()).returning();
      const [saved] = await db.insert(payrollItems).values(item(r.id)).returning();
      expect(saved.net).toBe("30000.00");
      expect(saved.absentDays).toBe(0);
      expect(await refusal(db.insert(payrollItems).values(item(r.id)))).toContain("payroll_items_run_employee_key");
      await db.delete(payrollRuns).where(eq(payrollRuns.id, r.id));
      expect(await db.select().from(payrollItems).where(eq(payrollItems.runId, r.id))).toHaveLength(0);
    });

    it("refuses negative counts and money", async () => {
      const [r] = await db.insert(payrollRuns).values(run()).returning();
      expect(await refusal(db.insert(payrollItems).values(item(r.id, { absentDays: -1 })))).toContain("payroll_items_counts_not_negative");
      expect(await refusal(db.insert(payrollItems).values(item(r.id, { deductions: "-5" })))).toContain("payroll_items_money_not_negative");
    });
  });

  describe("payroll_adjustments", () => {
    const adjustment = (over: Partial<typeof payrollAdjustments.$inferInsert> = {}) => ({
      employeeId,
      month: nextMonth(),
      type: "bonus" as const,
      amount: "1500.00",
      createdBy: userId,
      ...over,
    });

    it("saves a bonus and an advance for the same month", async () => {
      const month = nextMonth();
      await db.insert(payrollAdjustments).values(adjustment({ month }));
      await db.insert(payrollAdjustments).values(adjustment({ month, type: "advance", amount: "2000" }));
    });

    it("refuses zero or negative amounts, unknown types and mid-month dates", async () => {
      expect(await refusal(db.insert(payrollAdjustments).values(adjustment({ amount: "0" })))).toContain("payroll_adjustments_amount_positive");
      expect(await refusal(db.insert(payrollAdjustments).values(adjustment({ amount: "-10" })))).toContain("payroll_adjustments_amount_positive");
      expect(await refusal(db.insert(payrollAdjustments).values(adjustment({ month: `${baseYear + 20}-05-10` })))).toContain(
        "payroll_adjustments_month_start",
      );
      expect(await refusal(db.insert(payrollAdjustments).values(adjustment({ type: "tip" as "bonus" })))).toContain("payroll_adjustment_type");
    });
  });
});

