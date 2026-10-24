import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, ruleSets, users } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { createRuleSet, listRuleSets, updateRuleSet, type RuleSetInput } from "@/lib/payroll/rules";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

describe.skipIf(!testDatabaseUrl)("rule sets", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;

  // Rows stay in the shared test database and a month holds one rule set, so each run
  // takes months from a random far-future year.
  const baseYear = 3000 + Math.floor(Math.random() * 5000);
  let counter = 0;
  const nextMonth = () => {
    const index = counter++;
    return `${baseYear + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  };

  const input = (over: Partial<RuleSetInput> = {}): RuleSetInput => ({
    effectiveFromMonth: nextMonth(),
    lateMode: "days_per_lates",
    lateEveryN: "3",
    lateAmount: "",
    deductionBase: "gross",
    divisor: "working_days",
    unpaidLeaveAsAbsent: true,
    ...over,
  });

  beforeAll(async () => {
    ({ db, close } = connect());
    userId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Owner", email: `${userId}@example.test`, role: "owner" });
  });
  afterAll(() => close());

  it("saves a rule set from the first day of its month and writes an audit row", async () => {
    const created = await createRuleSet(db, input({ effectiveFromMonth: nextMonth() }), userId);
    const [row] = await db.select().from(ruleSets).where(eq(ruleSets.id, created.id));
    expect(row.effectiveFromMonth).toBe(`${created.effectiveFromMonth}-01`);
    expect(row.createdBy).toBe(userId);
    expect(created).toMatchObject({ lateMode: "days_per_lates", lateEveryN: 3, lateAmount: null, deductionBase: "gross", divisor: "working_days" });

    const trail = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(trail.map((t) => t.action)).toEqual(["rule_set.create"]);
    expect(trail[0].actorId).toBe(userId);
  });

  it("refuses a second rule set in the same month", async () => {
    const month = nextMonth();
    await createRuleSet(db, input({ effectiveFromMonth: month }), userId);
    const error = await createRuleSet(db, input({ effectiveFromMonth: month }), userId).catch((e) => e);
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("refuses invalid rules before touching the database", async () => {
    await expect(createRuleSet(db, input({ lateEveryN: "" }), userId)).rejects.toThrow();
  });

  it("lists newest start month first", async () => {
    const early = await createRuleSet(db, input(), userId);
    const late = await createRuleSet(db, input(), userId);
    const ids = (await listRuleSets(db)).map((r) => r.id);
    expect(ids.indexOf(late.id)).toBeLessThan(ids.indexOf(early.id));
  });

  it("changes a rule set, keeps its month, and records before and after", async () => {
    const created = await createRuleSet(db, input(), userId);
    const result = await updateRuleSet(db, created.id, input({ effectiveFromMonth: "1999-01", lateMode: "fixed_per_late", lateEveryN: "", lateAmount: "50", divisor: "thirty" }), userId);

    expect(result?.changed).toBe(true);
    expect(result?.ruleSet).toMatchObject({
      effectiveFromMonth: created.effectiveFromMonth,
      lateMode: "fixed_per_late",
      lateEveryN: null,
      lateAmount: "50.00",
      divisor: "thirty",
    });

    const trail = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    const update = trail.find((t) => t.action === "rule_set.update");
    expect(update).toBeDefined();
    expect((update!.before as { lateMode: string }).lateMode).toBe("days_per_lates");
    expect((update!.after as { lateMode: string }).lateMode).toBe("fixed_per_late");
  });

  it("writes nothing when the values are the same", async () => {
    const created = await createRuleSet(db, input({ lateMode: "fixed_per_late", lateEveryN: "", lateAmount: "50" }), userId);
    // 50 and 50.00 are the same amount.
    const result = await updateRuleSet(db, created.id, input({ effectiveFromMonth: created.effectiveFromMonth, lateMode: "fixed_per_late", lateEveryN: "", lateAmount: "50.00" }), userId);
    expect(result?.changed).toBe(false);
    const trail = await db.select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(trail.map((t) => t.action)).toEqual(["rule_set.create"]);
  });

  it("returns null for rules that do not exist", async () => {
    expect(await updateRuleSet(db, "00000000-0000-4000-8000-000000000000", input(), userId)).toBeNull();
  });
});
