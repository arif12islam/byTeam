import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import {
  attendanceAdjustments,
  attendanceDays,
  deviceCommands,
  employees,
  leaveRequests,
  payrollAdjustments,
  payrollItems,
  payrollRuns,
  rawPunches,
  salaryStructures,
  shifts,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { recalcAfterEmployeeChange } from "@/lib/attendance/triggers";
import { queueUserUpdate } from "@/lib/devices/queue";
import { formatMonth, isValidOfficeDate } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

/** Empty text becomes null so optional columns stay clean. */
const optionalText = (label: string) =>
  z
    .string()
    .trim()
    .max(80, `${label} can be at most 80 characters.`)
    .transform((v) => (v === "" ? null : v))
    .nullish()
    .transform((v) => v ?? null);

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullish()
  .transform((v) => v ?? null)
  .refine((v) => v === null || isValidOfficeDate(v), "Enter a valid date.");

/**
 * The employee code is the PIN on the device, so it is digits only. It is
 * text, not a number, to keep leading zeros. It cannot change after creation:
 * past punches are matched to people by this code.
 */
export const empCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{1,24}$/, "Use digits only, like 1001. This is the number the person enters on the device.");

export const employeeDetailsSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the employee's name.").max(120, "Use 120 characters or fewer."),
    department: optionalText("Department"),
    designation: optionalText("Designation"),
    joinDate: z.string().refine(isValidOfficeDate, "Enter the join date."),
    exitDate: optionalDate,
    shiftId: z.uuid("Choose a shift."),
    excludeFromInsights: z.boolean().default(false),
  })
  .refine((e) => e.exitDate === null || e.exitDate >= e.joinDate, {
    path: ["exitDate"],
    message: "The exit date cannot be before the join date.",
  });

export const newEmployeeSchema = z.intersection(z.object({ empCode: empCodeSchema }), employeeDetailsSchema);

export type EmployeeDetails = z.output<typeof employeeDetailsSchema>;
export type NewEmployee = z.input<typeof newEmployeeSchema>;
export type EmployeeDetailsInput = z.input<typeof employeeDetailsSchema>;

export type EmployeeRow = {
  id: string;
  empCode: string;
  name: string;
  department: string | null;
  designation: string | null;
  joinDate: string;
  exitDate: string | null;
  shiftId: string;
  shiftName: string;
  active: boolean;
  excludeFromInsights: boolean;
};

const columns = {
  id: employees.id,
  empCode: employees.empCode,
  name: employees.name,
  department: employees.department,
  designation: employees.designation,
  joinDate: employees.joinDate,
  exitDate: employees.exitDate,
  shiftId: employees.shiftId,
  shiftName: shifts.name,
  active: employees.active,
  excludeFromInsights: employees.excludeFromInsights,
};

/** Employee codes are digits, so sort by length first and then by text: 2 before 10. */
export function byEmpCode(a: { empCode: string }, b: { empCode: string }): number {
  const x = a.empCode.replace(/^0+(?=\d)/, "");
  const y = b.empCode.replace(/^0+(?=\d)/, "");
  return x.length - y.length || x.localeCompare(y);
}

export async function listEmployees(db: Db, show: "active" | "inactive"): Promise<EmployeeRow[]> {
  const rows = await db
    .select(columns)
    .from(employees)
    .innerJoin(shifts, eq(shifts.id, employees.shiftId))
    .where(eq(employees.active, show === "active"))
    .orderBy(asc(employees.name));
  return rows.sort(byEmpCode);
}

export async function countByStatus(db: Db): Promise<{ active: number; inactive: number }> {
  const rows = await db.select({ active: employees.active }).from(employees);
  const active = rows.filter((r) => r.active).length;
  return { active, inactive: rows.length - active };
}

export async function getEmployee(db: Db, id: string): Promise<EmployeeRow | null> {
  const [row] = await db
    .select(columns)
    .from(employees)
    .innerJoin(shifts, eq(shifts.id, employees.shiftId))
    .where(eq(employees.id, id));
  return row ?? null;
}

/** Throws a unique violation when the code is taken, and a foreign key violation when the shift is gone. */
export async function createEmployee(db: Db, input: NewEmployee, actorId: string) {
  const data = newEmployeeSchema.parse(input);

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(employees).values(data).returning();
    await audit(tx, { actorId, action: "employee.create", entity: "employee", entityId: row.id, after: row });
    await queueUserUpdate(tx, { empCode: row.empCode, name: row.name });
    return row;
  });
}

const EDITABLE = ["name", "department", "designation", "joinDate", "exitDate", "shiftId", "excludeFromInsights"] as const;

/** Returns null when the employee is gone. Saving unchanged values writes nothing. */
export async function updateEmployee(db: Db, id: string, input: EmployeeDetailsInput, actorId: string) {
  const data = employeeDetailsSchema.parse(input);

  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(employees).where(eq(employees.id, id));
    if (!before) return null;

    if (EDITABLE.every((key) => before[key] === data[key])) return { employee: before, changed: false, before };

    const [after] = await tx.update(employees).set(data).where(eq(employees.id, id)).returning();
    await audit(tx, { actorId, action: "employee.update", entity: "employee", entityId: id, before, after });
    // Only the name is kept on the device, so only a new name needs sending.
    if (before.name !== after.name) await queueUserUpdate(tx, { empCode: after.empCode, name: after.name });
    return { employee: after, changed: true, before };
  });

  if (result?.changed) {
    await recalcAfterEmployeeChange(
      db,
      id,
      { shiftId: result.before.shiftId, joinDate: result.before.joinDate, exitDate: result.before.exitDate },
      { shiftId: result.employee.shiftId, joinDate: result.employee.joinDate, exitDate: result.employee.exitDate },
    );
  }
  return result ? { employee: result.employee, changed: result.changed } : null;
}

/** Deactivating keeps every record: history is never deleted. Returns null when the employee is gone. */
export async function setEmployeeActive(db: Db, id: string, active: boolean, actorId: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(employees).where(eq(employees.id, id));
    if (!before) return null;
    if (before.active === active) return { changed: false };

    const [after] = await tx.update(employees).set({ active }).where(eq(employees.id, id)).returning();
    await audit(tx, {
      actorId,
      action: active ? "employee.activate" : "employee.deactivate",
      entity: "employee",
      entityId: id,
      before,
      after,
    });
    return { changed: true };
  });
}

export type DeleteEmployeeResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes an employee that was added by mistake: one with no punches, leave,
 * payroll or hand corrections on record. Their computed attendance days and
 * salary entries go with them, since they only exist for this person. Anyone
 * with history is switched off instead, because history is never deleted.
 */
export async function deleteEmployee(db: Db, id: string, actorId: string): Promise<DeleteEmployeeResult> {
  return db.transaction(async (tx): Promise<DeleteEmployeeResult> => {
    const [before] = await tx.select().from(employees).where(eq(employees.id, id));
    if (!before) return { ok: true };

    const total = async (query: Promise<{ n: number }[]>) => (await query)[0].n;
    const reasons: string[] = [];
    if ((await total(tx.select({ n: count() }).from(rawPunches).where(eq(rawPunches.empCode, before.empCode)))) > 0) reasons.push("punches");
    if ((await total(tx.select({ n: count() }).from(leaveRequests).where(eq(leaveRequests.employeeId, id)))) > 0) reasons.push("leave");
    if ((await total(tx.select({ n: count() }).from(payrollItems).where(eq(payrollItems.employeeId, id)))) > 0) reasons.push("payroll");
    if ((await total(tx.select({ n: count() }).from(payrollAdjustments).where(eq(payrollAdjustments.employeeId, id)))) > 0) reasons.push("bonuses or advances");
    if ((await total(tx.select({ n: count() }).from(attendanceAdjustments).where(eq(attendanceAdjustments.employeeId, id)))) > 0) reasons.push("hand corrections");
    if (reasons.length > 0) {
      return {
        ok: false,
        error: `${before.name} has ${reasons.join(", ")} on record, and history is never deleted. Switch them off instead: they leave Today, Attendance and new payroll, and the history stays.`,
      };
    }

    await tx.delete(attendanceDays).where(eq(attendanceDays.employeeId, id));
    await tx.delete(salaryStructures).where(eq(salaryStructures.employeeId, id));
    await tx.delete(employees).where(eq(employees.id, id));
    await audit(tx, { actorId, action: "employee.delete", entity: "employee", entityId: id, before });
    return { ok: true };
  });
}

/** True when the typed name is the person's name: spaces trimmed and collapsed, capital letters as written. */
export function nameConfirmed(typed: string, name: string): boolean {
  const clean = (text: string) => text.trim().replace(/\s+/g, " ");
  return clean(typed) !== "" && clean(typed) === clean(name);
}

/** The refusal for a person whose pay is in a finalized month, naming the months. */
export function finalizedPayrollMessage(name: string, months: ReadonlySet<string>): string {
  const names = [...months].sort().map(formatMonth);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Payroll for ${list} is finalized and includes ${name}, so they cannot be deleted. Unlock ${names.length === 1 ? "that month" : "those months"} first.`;
}

export type DeleteWithHistoryResult =
  | { ok: true; empCode: string; name: string; removed: Record<string, number> }
  | { ok: false; error: string };

/**
 * Deletes an employee together with their history: attendance days and hand
 * corrections, leave, salary, payroll lines and bonuses and advances, and any
 * user update still waiting for the device. The raw punches stay, because they
 * are never deleted; they become an unlinked code. Refused when the person is
 * in a finalized payroll month. One audit row keeps what was removed, as counts.
 */
export async function deleteEmployeeWithHistory(db: Db, id: string, confirmName: string, actorId: string): Promise<DeleteWithHistoryResult> {
  return db.transaction(async (tx): Promise<DeleteWithHistoryResult> => {
    const [before] = await tx.select().from(employees).where(eq(employees.id, id)).for("update");
    if (!before) return { ok: false, error: "That employee no longer exists." };
    if (!nameConfirmed(confirmName, before.name)) return { ok: false, error: "Type the name exactly as shown to confirm." };

    // Shared locks, so a month being finalized right now waits until this is saved.
    const finalized = new Set<string>();
    const lines = await tx
      .select({ month: payrollRuns.month })
      .from(payrollItems)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payrollItems.runId))
      .where(and(eq(payrollItems.employeeId, id), eq(payrollRuns.status, "finalized")))
      .for("share", { of: payrollRuns });
    for (const line of lines) finalized.add(line.month.slice(0, 7));
    const bonusMonths = await tx
      .select({ month: payrollAdjustments.month })
      .from(payrollAdjustments)
      .innerJoin(payrollRuns, eq(payrollRuns.month, payrollAdjustments.month))
      .where(and(eq(payrollAdjustments.employeeId, id), eq(payrollRuns.status, "finalized")))
      .for("share", { of: payrollRuns });
    for (const row of bonusMonths) finalized.add(row.month.slice(0, 7));
    if (finalized.size > 0) return { ok: false, error: finalizedPayrollMessage(before.name, finalized) };

    const removed: Record<string, number> = {};
    removed.payrollItems = (await tx.delete(payrollItems).where(eq(payrollItems.employeeId, id)).returning({ id: payrollItems.id })).length;
    removed.payrollAdjustments = (await tx.delete(payrollAdjustments).where(eq(payrollAdjustments.employeeId, id)).returning({ id: payrollAdjustments.id })).length;
    removed.attendanceAdjustments = (await tx.delete(attendanceAdjustments).where(eq(attendanceAdjustments.employeeId, id)).returning({ id: attendanceAdjustments.id })).length;
    removed.attendanceDays = (await tx.delete(attendanceDays).where(eq(attendanceDays.employeeId, id)).returning({ id: attendanceDays.id })).length;
    removed.leaveRequests = (await tx.delete(leaveRequests).where(eq(leaveRequests.employeeId, id)).returning({ id: leaveRequests.id })).length;
    removed.salaryStructures = (await tx.delete(salaryStructures).where(eq(salaryStructures.employeeId, id)).returning({ id: salaryStructures.id })).length;
    // A user update still waiting for the device would put the person back on it. Matched by prefix, not LIKE: codes can hold _ or %.
    const prefix = `DATA UPDATE USERINFO PIN=${before.empCode}\t`;
    removed.deviceCommands = (
      await tx
        .delete(deviceCommands)
        .where(and(eq(deviceCommands.status, "pending"), sql`left(${deviceCommands.command}, ${prefix.length}) = ${prefix}`))
        .returning({ id: deviceCommands.id })
    ).length;
    await tx.delete(employees).where(eq(employees.id, id));

    const [punches] = await tx.select({ n: count() }).from(rawPunches).where(eq(rawPunches.empCode, before.empCode));
    await audit(tx, {
      actorId,
      action: "employee.delete_with_history",
      entity: "employee",
      entityId: id,
      before: { employee: before, removed, punchesKept: punches.n },
    });
    return { ok: true, empCode: before.empCode, name: before.name, removed };
  });
}
