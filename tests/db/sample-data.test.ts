import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, companySettings, devices, employees, holidays, rawPunches, users } from "@/db/schema";
import { countActiveSamplePeople, loadSampleData, SAMPLE_DEVICE_SERIAL, switchOffSamplePeople } from "@/lib/demo/sample";
import { buildDemoPlan } from "@/lib/demo/scenarios";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

// October 2019 is used by nothing else in the tests: "now" is in November, so last month is October.
const NOW = new Date("2019-11-15T06:00:00Z");

describe.skipIf(!testDatabaseUrl)("sample data for a real byTeam", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actorId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    actorId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: actorId, name: "Owner", email: `${actorId}@example.test`, role: "owner" });
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    // Only this file adds sample people. Clear any left by an earlier run that stopped part way.
    await switchOffSamplePeople(db, actorId);
  });
  afterAll(() => close());

  it("adds eight Sample people for last month without a holiday, then switches them off", { timeout: 60_000 }, async () => {
    const result = await loadSampleData(db, actorId, NOW);
    if (!result.ok) throw new Error(result.error);
    expect(result.month).toBe("2019-10");
    expect(result.summary.employees).toBe(8);

    const people = await db.select().from(employees).where(inArray(employees.empCode, result.codes));
    expect(people).toHaveLength(8);
    expect(people.every((p) => p.name.startsWith("Sample ") && p.active)).toBe(true);
    expect(await countActiveSamplePeople(db)).toBeGreaterThanOrEqual(8);

    // The punches belong to a switched-off device of their own.
    const [device] = await db.select().from(devices).where(eq(devices.serialNo, SAMPLE_DEVICE_SERIAL));
    expect(device.active).toBe(false);
    expect(await db.select().from(rawPunches).where(and(eq(rawPunches.deviceSn, SAMPLE_DEVICE_SERIAL), inArray(rawPunches.empCode, result.codes)))).not.toHaveLength(0);

    // Unlike the demo seed, no public holiday is added: it would change real people's days.
    const plan = buildDemoPlan("2019-10", [5, 6], result.codes);
    expect(await db.select().from(holidays).where(eq(holidays.date, plan.holiday.date))).toHaveLength(0);

    // A second load is refused while sample people are active.
    const again = await loadSampleData(db, actorId, NOW);
    expect(again).toEqual({ ok: false, error: expect.stringContaining("already loaded") });

    // Switching off covers every sample person, each with an audit row.
    const switched = await switchOffSamplePeople(db, actorId);
    expect(switched).toBeGreaterThanOrEqual(8);
    expect(await countActiveSamplePeople(db)).toBe(0);
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "employee.deactivate"), inArray(auditLog.entityId, people.map((p) => p.id))));
    expect(rows).toHaveLength(8);
    expect(await db.select().from(employees).where(and(like(employees.name, "Sample %"), eq(employees.active, true)))).toHaveLength(0);
  });
});
