import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { employees, shifts } from "@/db/schema";
import { audit } from "@/lib/audit";
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
    return row;
  });
}

const EDITABLE = ["name", "department", "designation", "joinDate", "exitDate", "shiftId"] as const;

/** Returns null when the employee is gone. Saving unchanged values writes nothing. */
export async function updateEmployee(db: Db, id: string, input: EmployeeDetailsInput, actorId: string) {
  const data = employeeDetailsSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(employees).where(eq(employees.id, id));
    if (!before) return null;

    if (EDITABLE.every((key) => before[key] === data[key])) return { employee: before, changed: false };

    const [after] = await tx.update(employees).set(data).where(eq(employees.id, id)).returning();
    await audit(tx, { actorId, action: "employee.update", entity: "employee", entityId: id, before, after });
    return { employee: after, changed: true };
  });
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
