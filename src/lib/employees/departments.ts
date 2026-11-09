import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { departments, employees } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";

type Db = ReturnType<typeof getDb>;

export const departmentSchema = z.object({
  name: z.string().trim().min(1, "Enter the department name.").max(80, "Use 80 characters or fewer."),
});

export type DepartmentInput = z.input<typeof departmentSchema>;

export type DepartmentRow = { id: string; name: string; employeeCount: number };

export type DepartmentResult = { ok: true } | { ok: false; error: string };

const SAME_NAME = "There is already a department with that name.";

/** Every department by name, with how many employees are in it. */
export async function listDepartments(db: Pick<Db, "select">): Promise<DepartmentRow[]> {
  const rows = await db
    .select({ id: departments.id, name: departments.name, employeeCount: sql<number>`count(${employees.id})::int` })
    .from(departments)
    .leftJoin(employees, eq(employees.department, departments.name))
    .groupBy(departments.id)
    .orderBy(asc(departments.name));
  return rows;
}

/** True when the name is in the list. Used by the employee form, which only offers listed departments. */
export async function departmentExists(db: Pick<Db, "select">, name: string): Promise<boolean> {
  const [row] = await db.select({ id: departments.id }).from(departments).where(eq(departments.name, name));
  return Boolean(row);
}

export async function createDepartment(db: Db, input: DepartmentInput, actorId: string): Promise<DepartmentResult> {
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(departments).values(parsed.data).returning();
      await audit(tx, { actorId, action: "department.create", entity: "department", entityId: row.id, after: row });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: SAME_NAME };
    throw error;
  }
  return { ok: true };
}

/** Renames the department and everyone in it, in one step. Changing only the capital letters is allowed. */
export async function renameDepartment(db: Db, id: string, input: DepartmentInput, actorId: string): Promise<DepartmentResult> {
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    return await db.transaction(async (tx): Promise<DepartmentResult> => {
      const [before] = await tx.select().from(departments).where(eq(departments.id, id));
      if (!before) return { ok: false, error: "That department no longer exists. Reload the page." };
      if (before.name === parsed.data.name) return { ok: true };

      const [after] = await tx.update(departments).set({ name: parsed.data.name }).where(eq(departments.id, id)).returning();
      const moved = await tx.update(employees).set({ department: after.name }).where(eq(employees.department, before.name)).returning({ id: employees.id });
      await audit(tx, {
        actorId,
        action: "department.update",
        entity: "department",
        entityId: id,
        before,
        after: { ...after, employeesRenamed: moved.length },
      });
      return { ok: true };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: SAME_NAME };
    throw error;
  }
}

/** Deletes a department nobody is in. Move the people first, so no one is left without the list entry. */
export async function deleteDepartment(db: Db, id: string, actorId: string): Promise<DepartmentResult> {
  return db.transaction(async (tx): Promise<DepartmentResult> => {
    const [before] = await tx.select().from(departments).where(eq(departments.id, id));
    if (!before) return { ok: true };

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(eq(employees.department, before.name));
    if (count > 0) {
      return {
        ok: false,
        error: `${count === 1 ? "1 employee is" : `${count} employees are`} in ${before.name}. Move them to another department first.`,
      };
    }

    await tx.delete(departments).where(eq(departments.id, id));
    await audit(tx, { actorId, action: "department.delete", entity: "department", entityId: id, before });
    return { ok: true };
  });
}
