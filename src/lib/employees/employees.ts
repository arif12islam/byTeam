import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import {
  attendanceAdjustments,
  attendanceDays,
  employees,
  leaveRequests,
  payrollAdjustments,
  payrollItems,
  rawPunches,
  salaryStructures,
  shifts,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { recalcAfterEmployeeChange } from "@/lib/attendance/triggers";
import { queueUserUpdate } from "@/lib/devices/queue";
import { isValidOfficeDate } from "@/lib/time";

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
