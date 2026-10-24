import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { getDb } from "@/db";
import { accounts, users, USER_ROLES } from "@/db/schema";
import { audit } from "@/lib/audit";

export const newUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
  // Matches minPasswordLength in src/lib/auth.ts.
  password: z.string().min(8, "Use at least 8 characters."),
  role: z.enum(USER_ROLES),
});

export type NewUser = z.input<typeof newUserSchema>;

type Db = ReturnType<typeof getDb>;

/**
 * Creates a login: the user row plus the credential account that holds the
 * password hash, and an audit row, all in one transaction. Better Auth signs
 * in against these same rows. actorId is null when a script runs it.
 */
export async function createUser(db: Db, input: NewUser, actorId: string | null) {
  const data = newUserSchema.parse(input);
  const id = randomUUID();
  const passwordHash = await hashPassword(data.password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ id, name: data.name, email: data.email, role: data.role })
      .returning();

    await tx.insert(accounts).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: passwordHash,
    });

    await audit(tx, {
      actorId,
      action: "user.create",
      entity: "user",
      entityId: id,
      after: user,
    });

    return user;
  });
}
