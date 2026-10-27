import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { accounts, sessions, users } from "@/db/schema";
import { audit } from "@/lib/audit";

type Db = ReturnType<typeof getDb>;

export const changeLoginSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email("Enter a valid email address.")),
    // Empty keeps the password as it is. Matches minPasswordLength in src/lib/auth.ts.
    newPassword: z.union([z.literal(""), z.string().min(8, "Use at least 8 characters for the new password.")]),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "The new passwords do not match.", path: ["confirmPassword"] });

export type ChangeLoginInput = z.input<typeof changeLoginSchema>;

export type ChangeLoginResult =
  | { ok: true; emailChanged: boolean; passwordChanged: boolean }
  | { ok: false; error: string };

/**
 * Changes the signed-in person's own email and, if given, password, after
 * checking their current password. A new password signs out every other
 * session (keepSessionId stays signed in). Each change writes an audit row;
 * the password itself never reaches the log.
 */
export async function changeLogin(db: Db, userId: string, input: ChangeLoginInput, keepSessionId: string): Promise<ChangeLoginResult> {
  const parsed = changeLoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
  if (!user || !account?.password) return { ok: false, error: "This login has no password to change. Sign out and in again." };
  if (!(await verifyPassword({ hash: account.password, password: data.currentPassword }))) {
    return { ok: false, error: "Your current password is not right." };
  }

  const emailChanged = data.email !== user.email;
  const passwordChanged = data.newPassword !== "";
  if (!emailChanged && !passwordChanged) return { ok: true, emailChanged, passwordChanged };

  if (emailChanged) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
    if (taken) return { ok: false, error: "Another login already uses that email." };
  }
  const newHash = passwordChanged ? await hashPassword(data.newPassword) : null;

  await db.transaction(async (tx) => {
    if (emailChanged) {
      const [after] = await tx.update(users).set({ email: data.email, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
      await audit(tx, { actorId: userId, action: "user.update", entity: "user", entityId: userId, before: user, after });
    }
    if (newHash) {
      await tx.update(accounts).set({ password: newHash, updatedAt: new Date() }).where(eq(accounts.id, account.id));
      await tx.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
      await audit(tx, {
        actorId: userId,
        action: "user.password_change",
        entity: "user",
        entityId: userId,
        after: { otherSessionsSignedOut: true },
      });
    }
  });
  return { ok: true, emailChanged, passwordChanged };
}
