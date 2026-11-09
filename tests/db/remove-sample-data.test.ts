import { readFileSync } from "node:fs";
import path from "node:path";

import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  attendanceDays,
  auditLog,
  companySettings,
  departments,
  devices,
  employees,
  leaveRequests,
  payrollAdjustments,
  payrollItems,
  payrollRuns,
  rawPunches,
  salaryStructures,
  shifts,
  users,
} from "@/db/schema";
import { buildDemoPlan } from "@/lib/demo/scenarios";
import { applyDemoPlan } from "@/lib/demo/seed";
import { listDevices, RETIRED_SAMPLE_DEVICE_SERIAL } from "@/lib/devices/devices";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

const SAMPLE_DEVICE_SERIAL = RETIRED_SAMPLE_DEVICE_SERIAL;
const SAMPLE_CODES = Array.from({ length: 8 }, (_, i) => String(9701 + i));

/** What the old Settings button added: the demo month with every name marked "Sample" and the department "(sample)". */
async function addSampleData(db: TestDb, actorId: string) {
  const plan = buildDemoPlan("2019-10", [5, 6], SAMPLE_CODES);
  const marked = { ...plan, employees: plan.employees.map((e) => ({ ...e, name: `Sample ${e.name}`, department: `${e.department} (sample)` })) };
  return applyDemoPlan(db, marked, {
    actorId,
    deviceSerial: SAMPLE_DEVICE_SERIAL,
    deviceName: "Sample punches (not a real device)",
    holiday: false,
    names: { shift: "Sample day shift" },
    today: "2019-11-15",
  });
}

const migration = readFileSync(path.join(__dirname, "..", "..", "src", "db", "migrations", "0012_m7_remove_sample_data.sql"), "utf8");

describe.skipIf(!testDatabaseUrl)("the migration that removes sample data", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actorId: string;

  /** Runs the migration the way drizzle does: statement by statement, in one transaction. */
  const runMigration = () =>
    db.transaction(async (tx) => {
      for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
    });

  beforeAll(async () => {
    ({ db, close } = connect());
    actorId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: actorId, name: "Owner", email: `${actorId}@example.test`, role: "owner" });
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });
    // A run that stopped part way may have left sample people behind.
    await runMigration();
  });
  afterAll(() => close());

  it("removes the sample people and everything that hangs on them, and nothing real", { timeout: 90_000 }, async () => {
    await addSampleData(db, actorId);
    const sampleIds = (await db.select({ id: employees.id }).from(employees).where(inArray(employees.empCode, SAMPLE_CODES))).map((r) => r.id);
    expect(sampleIds).toHaveLength(8);

    // Look-alikes that must survive: a real Sample by name only, and a full look-alike in a finalized payroll month.
    const [shift] = await db.insert(shifts).values({ name: `Real shift ${uniqueCode()}`, startTime: "09:00", endTime: "18:00" }).returning();
    const fourDigits = () => `9${String(Math.floor(Math.random() * 900) + 100)}`;
    const [byName] = await db
      .insert(employees)
      .values({ empCode: uniqueCode(), name: "Sample Rahim", department: "Sales", joinDate: "2019-01-01", shiftId: shift.id })
      .returning();
    const [byCode] = await db
      .insert(employees)
      .values({ empCode: fourDigits(), name: "Sample Karim", department: "Accounts", joinDate: "2019-01-01", shiftId: shift.id })
      .onConflictDoNothing()
      .returning();
    const [paid] = await db
      .insert(employees)
      .values({ empCode: `9${String(Math.floor(Math.random() * 90) + 10)}9`, name: "Sample Paid", department: "Ops (sample)", joinDate: "2019-01-01", shiftId: shift.id })
      .onConflictDoNothing()
      .returning();
    await db.delete(payrollRuns).where(eq(payrollRuns.month, "2019-09-01"));
    const [run] = await db
      .insert(payrollRuns)
      .values({ month: "2019-09-01", status: "finalized", ruleSetSnapshot: { test: true }, createdBy: actorId, finalizedBy: actorId, finalizedAt: new Date() })
      .returning();
    if (paid) {
      await db.insert(payrollItems).values({ runId: run.id, employeeId: paid.id, payableDays: 30, gross: "30000.00", net: "30000.00", breakdown: { test: true } });
    }

    // The sample data brought rows of every kind.
    expect((await db.select().from(attendanceDays).where(inArray(attendanceDays.employeeId, sampleIds))).length).toBeGreaterThan(0);
    expect((await db.select().from(salaryStructures).where(inArray(salaryStructures.employeeId, sampleIds))).length).toBeGreaterThan(0);
    expect((await db.select().from(leaveRequests).where(inArray(leaveRequests.employeeId, sampleIds))).length).toBeGreaterThan(0);
    expect((await db.select().from(payrollAdjustments).where(inArray(payrollAdjustments.employeeId, sampleIds))).length).toBeGreaterThan(0);
    const punchCount = async () => (await db.select().from(rawPunches).where(eq(rawPunches.deviceSn, SAMPLE_DEVICE_SERIAL))).length;
    const punchesBefore = await punchCount();
    expect(punchesBefore).toBeGreaterThan(0);

    await runMigration();

    // Gone: the people, their rows, the shift made for them.
    expect(await db.select().from(employees).where(inArray(employees.id, sampleIds))).toHaveLength(0);
    expect(await db.select().from(attendanceDays).where(inArray(attendanceDays.employeeId, sampleIds))).toHaveLength(0);
    expect(await db.select().from(salaryStructures).where(inArray(salaryStructures.employeeId, sampleIds))).toHaveLength(0);
    expect(await db.select().from(leaveRequests).where(inArray(leaveRequests.employeeId, sampleIds))).toHaveLength(0);
    expect(await db.select().from(payrollAdjustments).where(inArray(payrollAdjustments.employeeId, sampleIds))).toHaveLength(0);
    expect(await db.select().from(shifts).where(eq(shifts.name, "Sample day shift"))).toHaveLength(0);
    expect(await db.select().from(departments).where(sql`${departments.name} like '% (sample)'`)).toHaveLength(0);

    // Kept: the look-alikes, the punch log and its device.
    expect(await db.select().from(employees).where(eq(employees.id, byName.id))).toHaveLength(1);
    if (byCode) expect(await db.select().from(employees).where(eq(employees.id, byCode.id))).toHaveLength(1);
    if (paid) {
      expect(await db.select().from(employees).where(eq(employees.id, paid.id))).toHaveLength(1);
      expect(await db.select().from(payrollItems).where(eq(payrollItems.employeeId, paid.id))).toHaveLength(1);
    }
    expect(await punchCount()).toBe(punchesBefore);
    expect(await db.select().from(devices).where(eq(devices.serialNo, SAMPLE_DEVICE_SERIAL))).toHaveLength(1);

    // The punches stay but are out of sight: the device is not listed, and its codes are not offered as unmatched.
    expect((await listDevices(db)).some((d) => d.serialNo === SAMPLE_DEVICE_SERIAL)).toBe(false);
    expect((await listUnmatchedCodes(db)).some((u) => SAMPLE_CODES.includes(u.empCode))).toBe(false);

    // One audit row says what was removed, and running it again does nothing more.
    const removals = async () => db.select().from(auditLog).where(and(eq(auditLog.action, "sample_data.remove")));
    const after = await removals();
    expect(after.length).toBeGreaterThan(0);
    expect(JSON.stringify(after.at(-1)?.after)).toMatch(/"employees":\s*\d+/);
    await runMigration();
    expect(await removals()).toHaveLength(after.length);
  });
});
