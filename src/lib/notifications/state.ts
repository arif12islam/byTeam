import { eq, lt } from "drizzle-orm";

import type { getDb } from "@/db";
import { notificationState } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

/** Everything that has been announced and not yet forgotten, as key to value. */
export async function readState(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ key: notificationState.key, value: notificationState.value }).from(notificationState);
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function writeState(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(notificationState)
    .values({ key, value })
    .onConflictDoUpdate({ target: notificationState.key, set: { value, updatedAt: new Date() } });
}

export async function forgetState(db: Db, key: string): Promise<void> {
  await db.delete(notificationState).where(eq(notificationState.key, key));
}

/** Drops notes older than a month, so the table does not grow forever. */
export async function pruneState(db: Db, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  await db.delete(notificationState).where(lt(notificationState.updatedAt, cutoff));
}
