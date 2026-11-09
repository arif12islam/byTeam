import { randomUUID } from "node:crypto";

import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  attendanceAdjustments,
  attendanceDays,
  auditLog,
  deviceCommands,
  employees,
  leaveRequests,
  leaveTypes,
  payrollAdjustments,
  payrollItems,
  payrollRuns,
  rawPunches,
  salaryStructures,
  shifts,
} from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { deleteEmployeeWithHistory } from "@/lib/employees/employees";
import { createUser } from "@/lib/users";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

// 2047 is used by no other test.
const DRAFT_MONTH = "2047-03-01";
const FINAL_MONTH = "2047-04-01";

describe.skipIf(!testDatabaseUrl)("delete an employee with their history", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actor: string;
  let shiftId: string;
  let leaveTypeId: string;
  let serial: string;

  const breakdown = { test: true };
  const newPerson = async (label: string) =>
    (await db.insert(employees).values({ empCode: uniqueCode(), name: `History ${label} ${randomUUID().slice(0, 6)}`, joinDate: "2047-01-01", shiftId }).returning())[0];

  beforeAll(async () => {
    ({ db, close } = connect());
    actor = (await createUser(db, { name: "History tester", email: `history-${randomUUID()}@example.com`, password: "password-1", role: "owner" }, null)).id;
    // Runs left by an earlier failed run of this file; their items go with them.
    await db.delete(payrollRuns).where(inArray(payrollRuns.month, [DRAFT_MONTH, FINAL_MONTH]));
    shiftId = (await db.insert(shifts).values({ name: `History shift ${randomUUID()}`, startTime: "09:00", endTime: "18:00" }).returning())[0].id;
    leaveTypeId = (await db.insert(leaveTypes).values({ name: `History leave ${randomUUID()}`, isPaid: true }).returning())[0].id;
    serial = uniqueSerial("HIS");
    await addTestDevice(db, serial, false);
  });
  afterAll(async () => {
    await db.delete(payrollRuns).where(inArray(payrollRuns.month, [DRAFT_MONTH, FINAL_MONTH]));
    await close();
  });

  it("removes everything but the punches, and keeps the audit summary", { timeout: 60_000 }, async () => {
    const person = await newPerson("gone");
    const other = await newPerson("stays");

    await savePunches(db, [
      { deviceSn: serial, empCode: person.empCode, punchedAt: new Date("2047-03-03T04:00:00Z"), statusCode: 0, verifyCode: 1, rawLine: `${person.empCode} p1 ${randomUUID()}` },
      { deviceSn: serial, empCode: person.empCode, punchedAt: new Date("2047-03-03T12:00:00Z"), statusCode: 0, verifyCode: 1, rawLine: `${person.empCode} p2 ${randomUUID()}` },
    ]);
    for (const p of [person, other]) {
      await db.insert(attendanceDays).values({ employeeId: p.id, date: "2047-03-03", status: "present", punchCount: 2 });
      await db.insert(salaryStructures).values({ employeeId: p.id, gross: "30000", basicPct: "50", housePct: "30", medicalPct: "10", conveyancePct: "10", effectiveFrom: "2047-01-01" });
    }
    await db.insert(attendanceAdjustments).values({ employeeId: person.id, date: "2047-03-03", field: "status", newValue: "absent", reason: "test", createdBy: actor });
    await db.insert(leaveRequests).values({ employeeId: person.id, leaveTypeId, fromDate: "2047-03-10", toDate: "2047-03-10", days: 1, createdBy: actor });
    await db.insert(payrollAdjustments).values({ employeeId: person.id, month: DRAFT_MONTH, type: "bonus", amount: "500", createdBy: actor });
    const [draft] = await db.insert(payrollRuns).values({ month: DRAFT_MONTH, createdBy: actor }).returning();
    for (const p of [person, other]) {
      await db.insert(payrollItems).values({ runId: draft.id, employeeId: p.id, payableDays: 31, gross: "30000", net: "30000", breakdown });
    }
    // A user update still waiting for the device, one for this code and one for a code that only starts the same.
    const wait = (code: string) => ({ deviceSn: serial, command: `DATA UPDATE USERINFO PIN=${code}\tName=X\tPri=0` });
    await db.insert(deviceCommands).values([wait(person.empCode), wait(`${person.empCode}7`)]);

    expect(await deleteEmployeeWithHistory(db, person.id, "someone else", actor)).toEqual({ ok: false, error: "Type the name exactly as shown to confirm." });
    expect(await db.select().from(employees).where(eq(employees.id, person.id))).toHaveLength(1);

    const result = await deleteEmployeeWithHistory(db, person.id, `  ${person.name}  `, actor);
    expect(result).toMatchObject({ ok: true, empCode: person.empCode });
    if (!result.ok) return;
    expect(result.removed).toEqual({
      payrollItems: 1,
      payrollAdjustments: 1,
      attendanceAdjustments: 1,
      attendanceDays: 1,
      leaveRequests: 1,
      salaryStructures: 1,
      deviceCommands: 1,
    });

    for (const table of [attendanceDays, attendanceAdjustments, leaveRequests, payrollAdjustments, payrollItems, salaryStructures] as const) {
      expect(await db.select().from(table).where(eq(table.employeeId, person.id))).toHaveLength(0);
    }
    expect(await db.select().from(employees).where(eq(employees.id, person.id))).toHaveLength(0);
    // The punches stay; so do the draft run, the other person, and the other person's lines.
    expect(await db.select().from(rawPunches).where(eq(rawPunches.empCode, person.empCode))).toHaveLength(2);
    expect(await db.select().from(payrollRuns).where(eq(payrollRuns.id, draft.id))).toHaveLength(1);
    expect(await db.select().from(payrollItems).where(eq(payrollItems.employeeId, other.id))).toHaveLength(1);
    expect(await db.select().from(attendanceDays).where(eq(attendanceDays.employeeId, other.id))).toHaveLength(1);
    // The waiting update for the same-looking code stays; the one for this code is gone.
    const waiting = await db.select().from(deviceCommands).where(and(eq(deviceCommands.deviceSn, serial), like(deviceCommands.command, `%PIN=${person.empCode}%`)));
    expect(waiting.map((c) => c.command)).toEqual([`DATA UPDATE USERINFO PIN=${person.empCode}7\tName=X\tPri=0`]);

    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.entityId, person.id), eq(auditLog.action, "employee.delete_with_history")));
    expect(entry.actorId).toBe(actor);
    expect(entry.before).toMatchObject({ punchesKept: 2, removed: { attendanceDays: 1, leaveRequests: 1 }, employee: { empCode: person.empCode } });
  });

  it("refuses a person in a finalized payroll month, and removes nothing", { timeout: 60_000 }, async () => {
    const person = await newPerson("locked");
    await db.insert(attendanceDays).values({ employeeId: person.id, date: "2047-04-02", status: "present", punchCount: 2 });
    const [run] = await db
      .insert(payrollRuns)
      .values({ month: FINAL_MONTH, status: "finalized", ruleSetSnapshot: { test: true }, createdBy: actor, finalizedBy: actor, finalizedAt: new Date() })
      .returning();
    await db.insert(payrollItems).values({ runId: run.id, employeeId: person.id, payableDays: 30, gross: "30000", net: "30000", breakdown });

    const refused = await deleteEmployeeWithHistory(db, person.id, person.name, actor);
    expect(refused).toEqual({ ok: false, error: expect.stringContaining("Payroll for Apr 2047 is finalized") });
    expect(await db.select().from(employees).where(eq(employees.id, person.id))).toHaveLength(1);
    expect(await db.select().from(attendanceDays).where(eq(attendanceDays.employeeId, person.id))).toHaveLength(1);
    expect(await db.select().from(payrollItems).where(eq(payrollItems.employeeId, person.id))).toHaveLength(1);
  });

  it("refuses a person whose bonus is in a finalized month", { timeout: 60_000 }, async () => {
    const person = await newPerson("bonus");
    await db.insert(payrollAdjustments).values({ employeeId: person.id, month: FINAL_MONTH, type: "bonus", amount: "100", createdBy: actor });
    const refused = await deleteEmployeeWithHistory(db, person.id, person.name, actor);
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("Apr 2047") });
    expect(await db.select().from(employees).where(eq(employees.id, person.id))).toHaveLength(1);
  });

  it("says so when the person is already gone", async () => {
    expect(await deleteEmployeeWithHistory(db, randomUUID(), "Nobody", actor)).toEqual({ ok: false, error: "That employee no longer exists." });
  });
});
