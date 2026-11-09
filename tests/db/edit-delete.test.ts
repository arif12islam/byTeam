import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  attendanceDays,
  auditLog,
  employees,
  holidays,
  leaveRequests,
  leaveTypes,
  officeOutages,
  payrollRuns,
  ruleSets,
  salaryStructures,
  shifts,
} from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { createOutage, updateOutage } from "@/lib/attendance/outages";
import { deleteEmployee } from "@/lib/employees/employees";
import { deleteLeaveType } from "@/lib/leave/types";
import { createRuleSet, deleteRuleSet } from "@/lib/payroll/rules";
import { addHoliday, updateHoliday } from "@/lib/settings/holidays";
import { deleteShift } from "@/lib/shifts/shifts";
import { officeDateTimeToInstant } from "@/lib/time";
import { createUser } from "@/lib/users";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

/** Things the office creates can be changed and deleted, unless history depends on them. */
describe.skipIf(!testDatabaseUrl)("edit and delete", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actor: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    actor = (await createUser(db, { name: "Edit tester", email: `edit-${randomUUID()}@example.com`, password: "password-1", role: "owner" }, null)).id;
  });
  afterAll(async () => {
    await close();
  });

  // In the order they were written: without an order the database may hand rows back in any order.
  const logged = async (id: string) => (await db.select().from(auditLog).where(eq(auditLog.entityId, id)).orderBy(asc(auditLog.createdAt))).map((l) => l.action);
  const newShift = async () => (await db.insert(shifts).values({ name: `Del shift ${randomUUID()}`, startTime: "09:00", endTime: "18:00" }).returning())[0];
  const newPerson = async (shiftId: string) =>
    (await db.insert(employees).values({ empCode: uniqueCode(), name: "Del person", joinDate: "2026-01-01", shiftId }).returning())[0];

  describe("shifts", () => {
    it("deletes one nobody is on, and refuses one with people", async () => {
      const shift = await newShift();
      const person = await newPerson(shift.id);

      expect(await deleteShift(db, shift.id, actor)).toEqual({ ok: false, error: `1 employee is on ${shift.name}. Move them to another shift first.` });
      expect(await db.select().from(shifts).where(eq(shifts.id, shift.id))).toHaveLength(1);

      const other = await newShift();
      await db.update(employees).set({ shiftId: other.id }).where(eq(employees.id, person.id));
      expect(await deleteShift(db, shift.id, actor)).toEqual({ ok: true });
      expect(await db.select().from(shifts).where(eq(shifts.id, shift.id))).toHaveLength(0);
      expect(await logged(shift.id)).toContain("shift.delete");
    });
  });

  describe("leave types", () => {
    it("deletes an unused type, and keeps one with requests", async () => {
      const [unused] = await db.insert(leaveTypes).values({ name: `Unused ${randomUUID()}`, isPaid: true }).returning();
      expect(await deleteLeaveType(db, unused.id, actor)).toEqual({ ok: true });
      expect(await db.select().from(leaveTypes).where(eq(leaveTypes.id, unused.id))).toHaveLength(0);
      expect(await logged(unused.id)).toContain("leave_type.delete");

      const [used] = await db.insert(leaveTypes).values({ name: `Used ${randomUUID()}`, isPaid: true }).returning();
      const person = await newPerson((await newShift()).id);
      await db.insert(leaveRequests).values({ employeeId: person.id, leaveTypeId: used.id, fromDate: "2036-01-06", toDate: "2036-01-06", days: 1, createdBy: actor });
      const refused = await deleteLeaveType(db, used.id, actor);
      expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("1 leave request uses") });
      expect(await db.select().from(leaveTypes).where(eq(leaveTypes.id, used.id))).toHaveLength(1);
    });
  });

  describe("pay rules", () => {
    const rule = (month: string) => ({
      effectiveFromMonth: month,
      lateMode: "none" as const,
      lateEveryN: "",
      lateAmount: "",
      deductionBase: "gross" as const,
      divisor: "thirty" as const,
      unpaidLeaveAsAbsent: true,
    });

    it("deletes rules that no finalized month is paid under", async () => {
      await db.delete(ruleSets).where(eq(ruleSets.effectiveFromMonth, "2040-02-01"));
      const created = await createRuleSet(db, rule("2040-02"), actor);
      expect(await deleteRuleSet(db, created.id, actor)).toEqual({ ok: true });
      expect(await db.select().from(ruleSets).where(eq(ruleSets.id, created.id))).toHaveLength(0);
      expect(await logged(created.id)).toContain("rule_set.delete");
    });

    it("keeps rules a finalized month is paid under", async () => {
      await db.delete(payrollRuns).where(eq(payrollRuns.month, "2040-05-01"));
      await db.delete(ruleSets).where(eq(ruleSets.effectiveFromMonth, "2040-04-01"));
      const created = await createRuleSet(db, rule("2040-04"), actor);
      await db.insert(payrollRuns).values({ month: "2040-05-01", status: "finalized", ruleSetSnapshot: { test: true }, createdBy: actor, finalizedBy: actor, finalizedAt: new Date() });

      const refused = await deleteRuleSet(db, created.id, actor);
      expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("May 2040") });
      expect(await db.select().from(ruleSets).where(eq(ruleSets.id, created.id))).toHaveLength(1);
    });
  });

  describe("employees", () => {
    it("deletes one added by mistake, with the computed rows that only exist for them", async () => {
      const person = await newPerson((await newShift()).id);
      await db.insert(attendanceDays).values({ employeeId: person.id, date: "2026-02-01", status: "absent" });
      await db.insert(salaryStructures).values({ employeeId: person.id, gross: "30000", basicPct: "60", housePct: "20", medicalPct: "10", conveyancePct: "10", effectiveFrom: "2026-01-01" });

      expect(await deleteEmployee(db, person.id, actor)).toEqual({ ok: true });
      expect(await db.select().from(employees).where(eq(employees.id, person.id))).toHaveLength(0);
      expect(await db.select().from(attendanceDays).where(eq(attendanceDays.employeeId, person.id))).toHaveLength(0);
      expect(await db.select().from(salaryStructures).where(eq(salaryStructures.employeeId, person.id))).toHaveLength(0);
      expect(await logged(person.id)).toContain("employee.delete");
    });

    it("refuses someone with punches or leave, and keeps everything", async () => {
      const serial = uniqueSerial("DEL");
      await addTestDevice(db, serial);
      const punched = await newPerson((await newShift()).id);
      await savePunches(db, [
        { deviceSn: serial, empCode: punched.empCode, punchedAt: officeDateTimeToInstant("2026-02-02", "09:00")!, statusCode: 0, verifyCode: 1, rawLine: `${punched.empCode} 2026-02-02 09:00` },
      ]);
      const refused = await deleteEmployee(db, punched.id, actor);
      expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("has punches on record") });
      expect(await db.select().from(employees).where(eq(employees.id, punched.id))).toHaveLength(1);

      const onLeave = await newPerson((await newShift()).id);
      const [type] = await db.insert(leaveTypes).values({ name: `Del leave ${randomUUID()}`, isPaid: true }).returning();
      await db.insert(leaveRequests).values({ employeeId: onLeave.id, leaveTypeId: type.id, fromDate: "2036-01-06", toDate: "2036-01-06", days: 1, createdBy: actor });
      expect(await deleteEmployee(db, onLeave.id, actor)).toMatchObject({ ok: false, error: expect.stringContaining("has leave on record") });
    });
  });

  describe("holidays", () => {
    it("changes the name and the date, and refuses a date another holiday has", async () => {
      await db.delete(holidays).where(eq(holidays.date, "2041-03-10"));
      await db.delete(holidays).where(eq(holidays.date, "2041-03-11"));
      await db.delete(holidays).where(eq(holidays.date, "2041-03-12"));
      const first = await addHoliday(db, { date: "2041-03-10", name: "Test day" }, actor);
      const second = await addHoliday(db, { date: "2041-03-11", name: "Other day" }, actor);

      expect(await updateHoliday(db, first.id, { date: "2041-03-12", name: "Renamed day" }, actor)).toEqual({ changed: true });
      expect((await db.select().from(holidays).where(eq(holidays.id, first.id)))[0]).toMatchObject({ date: "2041-03-12", name: "Renamed day" });
      expect(await updateHoliday(db, first.id, { date: "2041-03-12", name: "Renamed day" }, actor)).toEqual({ changed: false });
      await expect(updateHoliday(db, first.id, { date: second.date, name: "Renamed day" }, actor)).rejects.toThrow();
      expect(await updateHoliday(db, randomUUID(), { date: "2041-03-13", name: "Nothing" }, actor)).toBeNull();
      expect(await logged(first.id)).toEqual(["holiday.create", "holiday.update"]);
    });
  });

  describe("outages", () => {
    it("corrects the times and reason, and refuses a finalized month", async () => {
      await db.delete(officeOutages).where(eq(officeOutages.date, "2041-08-06"));
      await db.delete(payrollRuns).where(eq(payrollRuns.month, "2041-09-01"));
      const created = await createOutage(db, { date: "2041-08-06", startTime: "09:00", endTime: "10:00", reason: "Power cut" }, actor, "2041-08-20");
      if (!created.ok) throw new Error(created.error);

      expect(await updateOutage(db, created.id, { date: "2041-08-06", startTime: "09:00", endTime: "11:30", reason: "Power cut, long" }, actor, "2041-08-20")).toEqual({
        ok: true,
        changed: true,
      });
      expect((await db.select().from(officeOutages).where(eq(officeOutages.id, created.id)))[0]).toMatchObject({ endTime: "11:30:00", reason: "Power cut, long" });
      expect(await updateOutage(db, created.id, { date: "2041-08-06", startTime: "09:00", endTime: "11:30", reason: "Power cut, long" }, actor, "2041-08-20")).toEqual({
        ok: true,
        changed: false,
      });
      expect(await updateOutage(db, created.id, { date: "2041-08-06", startTime: "12:00", endTime: "11:30", reason: "Bad times" }, actor, "2041-08-20")).toMatchObject({ ok: false });

      await db.insert(payrollRuns).values({ month: "2041-09-01", status: "finalized", ruleSetSnapshot: { test: true }, createdBy: actor, finalizedBy: actor, finalizedAt: new Date() });
      expect(await updateOutage(db, created.id, { date: "2041-09-02", startTime: "09:00", endTime: "10:00", reason: "Moved" }, actor, "2041-09-20")).toMatchObject({
        ok: false,
        error: expect.stringContaining("finalized"),
      });
      expect(await logged(created.id)).toEqual(["outage.create", "outage.update"]);
    });
  });
});
