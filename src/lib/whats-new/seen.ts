import { eq } from "drizzle-orm";

import type { getDb } from "@/db";
import { users } from "@/db/schema";

import { LATEST_RELEASE } from "./releases";

type Db = ReturnType<typeof getDb>;

/**
 * Remembers that this person has seen the newest release, so it is not shown
 * again. Only their own row changes, and the value is always the newest release,
 * never something the browser sends. It is a display preference, not business
 * data, so it writes no audit row.
 */
export async function markReleaseSeen(db: Db, userId: string): Promise<void> {
  await db.update(users).set({ lastSeenRelease: LATEST_RELEASE.id }).where(eq(users.id, userId));
}
