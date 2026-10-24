import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

/**
 * Tests in tests/db run against a real Postgres: set DATABASE_URL_TEST to a
 * database that has had `npm run db:migrate` applied. CI does this with a
 * throwaway service. Without it the tests are skipped, so `npm test` still works
 * anywhere.
 *
 * Never point it at a real database. The tests add rows and the punch log cannot
 * be cleaned up, by design. Each test uses its own random serial number and
 * employee codes so runs do not disturb one another.
 */
export const testDatabaseUrl = process.env.DATABASE_URL_TEST;

export function connect() {
  const client = postgres(testDatabaseUrl!, { max: 6, prepare: false, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type TestDb = ReturnType<typeof connect>["db"];

let counter = 0;

/** A unique, valid device serial number. */
export function uniqueSerial(prefix = "T"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

/** A unique employee code made of digits. */
export function uniqueCode(): string {
  counter += 1;
  return `9${Date.now().toString().slice(-9)}${counter}${Math.floor(Math.random() * 1000)}`;
}

export async function addTestDevice(db: TestDb, serialNo: string, active = true) {
  const [row] = await db.insert(schema.devices).values({ serialNo, name: `Test ${serialNo}`, active }).returning();
  return row;
}
