import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, employees, leaveRequests, shifts, users } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { createLeaveType, getLeaveYearBasis, listLeaveTypes, saveLeaveYearBasis, updateLeaveType } from "@/lib/leave/types";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

describe.skipIf(!testDatabaseUrl)("leave types", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    userId = `leave-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "hr" });
  });
  afterAll(() => close());

  const auditFor = (id: string) => db.select().from(auditLog).where(eq(auditLog.entityId, id));

  it("creates a type and writes an audit row", async () => {
    const name = `Casual ${uniqueCode()}`;
    const row = await createLeaveType(db, { name, yearlyQuota: "10", isPaid: true }, userId);
    expect(row).toMatchObject({ name, yearlyQuota: 10, isPaid: true, active: true });
    const [entry] = await auditFor(row.id);
    expect(entry).toMatchObject({ action: "leave_type.create", actorId: userId, entity: "leave_type" });
  });

  it("refuses a second type with the same name, whatever the capital letters", async () => {
    const name = `Sick ${uniqueCode()}`;
    await createLeaveType(db, { name, yearlyQuota: "14", isPaid: true }, userId);
    let caught: unknown;
    try {
      await createLeaveType(db, { name: name.toUpperCase(), yearlyQuota: "", isPaid: false }, userId);
    } catch (error) {
      caught = error;
    }
    expect(isUniqueViolation(caught)).toBe(true);
  });

  it("updates a type with before and after in the audit row, and writes nothing when nothing changed", async () => {
    const row = await createLeaveType(db, { name: `Annual ${uniqueCode()}`, yearlyQuota: "15", isPaid: true }, userId);
    const same = await updateLeaveType(db, row.id, { name: row.name, yearlyQuota: "15", isPaid: true, active: true }, userId);
    expect(same).toMatchObject({ changed: false });
    expect(await auditFor(row.id)).toHaveLength(1);

    const changed = await updateLeaveType(db, row.id, { name: row.name, yearlyQuota: "", isPaid: false, active: true }, userId);
    expect(changed).toMatchObject({ changed: true, leaveType: { yearlyQuota: null, isPaid: false } });
    const entries = await auditFor(row.id);
    const update = entries.find((e) => e.action === "leave_type.update");
    expect(update?.before).toMatchObject({ yearlyQuota: 15, isPaid: true });
    expect(update?.after).toMatchObject({ yearlyQuota: null, isPaid: false });
  });

  it("returns null for a type that does not exist", async () => {
    expect(
      await updateLeaveType(db, "00000000-0000-4000-8000-000000000000", { name: "Ghost", yearlyQuota: "", isPaid: true, active: true }, userId),
    ).toBeNull();
  });

  it("switches a type off, keeps it listed after the active ones, and hides it from an active-only list", async () => {
    const prefix = `Switch ${uniqueCode()}`;
    const keep = await createLeaveType(db, { name: `${prefix} b`, yearlyQuota: "3", isPaid: true }, userId);
    const off = await createLeaveType(db, { name: `${prefix} a`, yearlyQuota: "3", isPaid: true }, userId);
    await updateLeaveType(db, off.id, { name: off.name, yearlyQuota: "3", isPaid: true, active: false }, userId);

    const mine = (await listLeaveTypes(db)).filter((t) => t.name.startsWith(prefix));
    expect(mine.map((t) => [t.name.slice(-1), t.active])).toEqual([["b", true], ["a", false]]);
    expect((await listLeaveTypes(db, { activeOnly: true })).some((t) => t.id === off.id)).toBe(false);
    expect((await listLeaveTypes(db, { activeOnly: true })).some((t) => t.id === keep.id)).toBe(true);
  });

  it("counts the requests that use a type", async () => {
    const type = await createLeaveType(db, { name: `Counted ${uniqueCode()}`, yearlyQuota: "5", isPaid: true }, userId);
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Leave ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: "Leave Person", joinDate: "2026-01-01", shiftId: shift.id }).returning();
    await db.insert(leaveRequests).values({
      employeeId: employee.id,
      leaveTypeId: type.id,
      fromDate: "2030-06-03",
      toDate: "2030-06-03",
      days: 1,
      createdBy: userId,
    });
    expect((await listLeaveTypes(db)).find((t) => t.id === type.id)?.requestCount).toBe(1);
  });
});

describe.skipIf(!testDatabaseUrl)("leave year basis", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    userId = `basis-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "owner" });
  });
  afterAll(async () => {
    // Leave the shared settings row as the calendar year, which is what other tests expect.
    await saveLeaveYearBasis(db, "calendar", userId);
    await close();
  });

  it("saves the choice with an audit row, and a repeat of the same choice writes nothing", async () => {
    await saveLeaveYearBasis(db, "calendar", userId);
    expect(await getLeaveYearBasis(db)).toBe("calendar");

    expect(await saveLeaveYearBasis(db, "anniversary", userId)).toEqual({ changed: true });
    expect(await getLeaveYearBasis(db)).toBe("anniversary");
    expect(await saveLeaveYearBasis(db, "anniversary", userId)).toEqual({ changed: false });

    const mine = (await db.select().from(auditLog).where(eq(auditLog.actorId, userId))).filter((e) => e.entity === "company_settings");
    const last = mine[mine.length - 1];
    expect(last.after).toMatchObject({ leaveYearBasis: "anniversary" });
    expect(last.before).toMatchObject({ leaveYearBasis: "calendar" });
  });

  it("refuses a choice that is not one of the two", async () => {
    await expect(saveLeaveYearBasis(db, "fiscal", userId)).rejects.toThrow();
  });
});
