/**
 * Creates the first owner login. Safe to run on every deploy: it does nothing
 * when an owner already exists.
 *
 *   OWNER_EMAIL=you@example.com OWNER_NAME="Your Name" OWNER_PASSWORD=... npm run seed:owner
 *
 * The values can also live in .env.local. There is no default password.
 */
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { createUser, newUserSchema } from "../src/lib/users";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Fill it in .env.local first.");

  const parsed = newUserSchema.safeParse({
    name: process.env.OWNER_NAME || "Owner",
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
    role: "owner",
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Set OWNER_EMAIL and OWNER_PASSWORD.\n  ${problems.join("\n  ")}`);
  }

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  try {
    const [existing] = await db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.role, "owner"))
      .limit(1);

    if (existing) {
      console.log(`An owner already exists (${existing.email}). Nothing to do.`);
      return;
    }

    const user = await createUser(db, parsed.data, null);
    console.log(`Created owner ${user.email}. Sign in at /login.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
