import { randomUUID } from "node:crypto";

import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { accounts, auditLog, sessions } from "@/db/schema";
import { changeLogin } from "@/lib/account";
import { createUser } from "@/lib/users";

import { connect, testDatabaseUrl, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

describe.skipIf(!testDatabaseUrl)("changeLogin", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(async () => {
    await close();
  });

  async function person() {
    const email = `login-${randomUUID()}@example.com`;
    const user = await createUser(db, { name: "Login test", email, password: "old-password", role: "owner" }, null);
    const session = (id: string) => ({ id, token: randomUUID(), userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) });
    const [here, elsewhere] = [randomUUID(), randomUUID()];
    await db.insert(sessions).values([session(here), session(elsewhere)]);
    return { user, email, here, elsewhere };
  }

  const hashOf = async (userId: string) =>
    (await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential"))))[0].password!;

  it("refuses a wrong current password and changes nothing", async () => {
    const { user, email, here } = await person();
    const result = await changeLogin(db, user.id, { currentPassword: "nope", name: "Login test", email: "x@example.com", newPassword: "new-password", confirmPassword: "new-password" }, here);
    expect(result).toEqual({ ok: false, error: "Your current password is not right." });
    expect(await verifyPassword({ hash: await hashOf(user.id), password: "old-password" })).toBe(true);
    expect((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user.id) }))?.email).toBe(email);
  });

  it("changes email and password, signs out other sessions and audits without the password", async () => {
    const { user, here, elsewhere } = await person();
    const newEmail = `New-${randomUUID()}@Example.com`;
    const result = await changeLogin(db, user.id, { currentPassword: "old-password", name: "Mother Love Air Travels", email: newEmail, newPassword: "new-password", confirmPassword: "new-password" }, here);
    expect(result).toEqual({ ok: true, nameChanged: true, emailChanged: true, passwordChanged: true });

    expect(await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user.id) })).toMatchObject({
      name: "Mother Love Air Travels",
      email: newEmail.toLowerCase(),
    });
    expect(await verifyPassword({ hash: await hashOf(user.id), password: "new-password" })).toBe(true);
    const left = (await db.select().from(sessions).where(eq(sessions.userId, user.id))).map((s) => s.id);
    expect(left).toEqual([here]);
    expect(left).not.toContain(elsewhere);

    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, user.id));
    expect(rows.map((r) => r.action).sort()).toEqual(["user.create", "user.password_change", "user.update"]);
    expect(JSON.stringify(rows)).not.toContain("new-password");
  });

  it("keeps the password when the new one is left empty", async () => {
    const { user, here, elsewhere } = await person();
    const result = await changeLogin(db, user.id, { currentPassword: "old-password", name: "Login test", email: `e-${randomUUID()}@example.com`, newPassword: "", confirmPassword: "" }, here);
    expect(result).toMatchObject({ ok: true, nameChanged: false, emailChanged: true, passwordChanged: false });
    expect(await verifyPassword({ hash: await hashOf(user.id), password: "old-password" })).toBe(true);
    expect((await db.select().from(sessions).where(eq(sessions.userId, user.id))).map((s) => s.id).sort()).toEqual([here, elsewhere].sort());
  });

  it("changes only the name", async () => {
    const { user, email, here } = await person();
    expect(await changeLogin(db, user.id, { currentPassword: "old-password", name: " New name ", email, newPassword: "", confirmPassword: "" }, here)).toEqual({
      ok: true,
      nameChanged: true,
      emailChanged: false,
      passwordChanged: false,
    });
    expect((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, user.id) }))?.name).toBe("New name");
  });

  it("refuses an email another login uses, and passwords that do not match", async () => {
    const a = await person();
    const b = await person();
    expect(await changeLogin(db, a.user.id, { currentPassword: "old-password", name: "Login test", email: b.email, newPassword: "", confirmPassword: "" }, a.here)).toEqual({
      ok: false,
      error: "Another login already uses that email.",
    });
    expect(await changeLogin(db, a.user.id, { currentPassword: "old-password", name: "Login test", email: a.email, newPassword: "new-password", confirmPassword: "other-pass" }, a.here)).toEqual({
      ok: false,
      error: "The new passwords do not match.",
    });
  });
});
