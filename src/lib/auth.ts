import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/db";
import * as schema from "@/db/schema";

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      // Accounts are created by the owner seed script and, later, by the owner
      // from inside the app. Nobody can register themselves.
      disableSignUp: true,
      minPasswordLength: 8,
    },
    // Model names point Better Auth at our plural table names in src/db/schema.
    user: {
      modelName: "users",
      additionalFields: {
        role: { type: "string", required: true, defaultValue: "hr", input: false },
      },
    },
    session: { modelName: "sessions" },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    // Keep last: lets server actions set the session cookie.
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

// Created on first use so builds and tests don't need DATABASE_URL.
const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  return (globalForAuth.auth ??= createAuth());
}
