import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auditLog, departments, employees, shifts } from "@/db/schema";
import { createDepartment, deleteDepartment, departmentExists, listDepartments, renameDepartment } from "@/lib/employees/departments";
import { createUser } from "@/lib/users";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

describe.skipIf(!testDatabaseUrl)("departments", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actor: string;
  let shiftId: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    actor = (await createUser(db, { name: "Dept tester", email: `dept-${randomUUID()}@example.com`, password: "password-1", role: "hr" }, null)).id;
    [{ id: shiftId }] = await db.insert(shifts).values({ name: `Dept shift ${randomUUID()}`, startTime: "09:00", endTime: "18:00" }).returning();
  });
  afterAll(async () => {
    await close();
  });

  const name = () => `Dept ${randomUUID().slice(0, 8)}`;
  const person = async (department: string | null) => {
    const [row] = await db.insert(employees).values({ empCode: uniqueCode(), name: "Dept person", department, joinDate: "2026-01-01", shiftId }).returning();
    return row;
  };
  const find = async (n: string) => (await listDepartments(db)).find((d) => d.name === n);

  it("adds a department once, ignoring case, and audits it", async () => {
    const n = name();
    expect(await createDepartment(db, { name: `  ${n}  ` }, actor)).toEqual({ ok: true });
    expect(await createDepartment(db, { name: n.toUpperCase() }, actor)).toEqual({ ok: false, error: "There is already a department with that name." });
    expect(await createDepartment(db, { name: "   " }, actor)).toEqual({ ok: false, error: "Enter the department name." });
    expect(await departmentExists(db, n)).toBe(true);
    const row = await find(n);
    expect(row?.employeeCount).toBe(0);
    const logged = await db.select().from(auditLog).where(eq(auditLog.entityId, row!.id));
    expect(logged.map((l) => l.action)).toEqual(["department.create"]);
  });

  it("counts the people in it", async () => {
    const n = name();
    await createDepartment(db, { name: n }, actor);
    await person(n);
    await person(n);
    await person(null);
    expect((await find(n))?.employeeCount).toBe(2);
  });

  it("renames it for everyone in it, and allows a change of capitals only", async () => {
    const n = name();
    await createDepartment(db, { name: n }, actor);
    const member = await person(n);
    const id = (await find(n))!.id;

    const renamed = `${n} renamed`;
    expect(await renameDepartment(db, id, { name: renamed }, actor)).toEqual({ ok: true });
    expect((await db.select().from(employees).where(eq(employees.id, member.id)))[0].department).toBe(renamed);
    expect((await find(renamed))?.employeeCount).toBe(1);

    expect(await renameDepartment(db, id, { name: renamed.toUpperCase() }, actor)).toEqual({ ok: true });
    expect((await db.select().from(employees).where(eq(employees.id, member.id)))[0].department).toBe(renamed.toUpperCase());

    const logged = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(logged.filter((l) => l.action === "department.update")).toHaveLength(2);
  });

  it("refuses a rename to a name another department has", async () => {
    const a = name();
    const b = name();
    await createDepartment(db, { name: a }, actor);
    await createDepartment(db, { name: b }, actor);
    expect(await renameDepartment(db, (await find(a))!.id, { name: b.toLowerCase() }, actor)).toEqual({
      ok: false,
      error: "There is already a department with that name.",
    });
  });

  it("deletes an empty department but not one with people in it", async () => {
    const n = name();
    await createDepartment(db, { name: n }, actor);
    await person(n);
    const id = (await find(n))!.id;

    const refused = await deleteDepartment(db, id, actor);
    expect(refused).toEqual({ ok: false, error: `1 employee is in ${n}. Move them to another department first.` });
    expect(await find(n)).toBeDefined();

    await db.update(employees).set({ department: null }).where(eq(employees.department, n));
    expect(await deleteDepartment(db, id, actor)).toEqual({ ok: true });
    expect(await find(n)).toBeUndefined();
    expect(await db.select().from(departments).where(eq(departments.id, id))).toHaveLength(0);
    const logged = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(logged.map((l) => l.action)).toContain("department.delete");
  });
});
