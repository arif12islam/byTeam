import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

// One client per server instance. Created on first use so builds and tests
// that never touch the database don't need DATABASE_URL.
const globalForDb = globalThis as unknown as { db?: Db };

export function getDb(): Db {
  if (globalForDb.db) return globalForDb.db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }

  // prepare: false keeps this compatible with Neon's pooled connection string.
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client, { schema });
  globalForDb.db = db;
  return db;
}
