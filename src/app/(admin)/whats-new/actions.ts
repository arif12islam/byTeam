"use server";

import { getDb } from "@/db";
import { requireRole } from "@/lib/session";
import { markReleaseSeen } from "@/lib/whats-new/seen";

/** Remembers that the signed-in person has seen the newest release. Takes nothing from the browser. */
export async function markWhatsNewSeenAction(): Promise<void> {
  const user = await requireRole("owner", "hr");
  await markReleaseSeen(getDb(), user.id);
}
