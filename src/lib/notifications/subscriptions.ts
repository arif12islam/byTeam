import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";

import { isPushEndpoint } from "./endpoints";

type Db = ReturnType<typeof getDb>;

const base64Url = /^[A-Za-z0-9_-]+={0,2}$/;

export const prefsSchema = z.object({
  onOffline: z.boolean(),
  onSummary: z.boolean(),
  onUnmatched: z.boolean(),
});
export type Prefs = z.infer<typeof prefsSchema>;

export const subscriptionSchema = z
  .object({
    endpoint: z.string().refine(isPushEndpoint, "That is not a push address from a browser."),
    p256dh: z.string().min(20).max(200).regex(base64Url),
    auth: z.string().min(8).max(100).regex(base64Url),
    userAgent: z.string().max(300).nullish(),
  })
  .extend(prefsSchema.shape);
export type SubscriptionInput = z.input<typeof subscriptionSchema>;

export type MySubscription = { endpoint: string } & Prefs;

/**
 * Remembers a device that turned notifications on. The same device turning
 * them on again updates its row; a device that was signed in as someone else
 * moves to the person using it now. Notification choices are a personal
 * setting, not office data, so there is no audit row.
 */
export async function saveSubscription(db: Db, userId: string, input: SubscriptionInput): Promise<void> {
  const data = subscriptionSchema.parse(input);
  const values = {
    userId,
    endpoint: data.endpoint,
    p256dh: data.p256dh,
    auth: data.auth,
    userAgent: data.userAgent ?? null,
    onOffline: data.onOffline,
    onSummary: data.onSummary,
    onUnmatched: data.onUnmatched,
  };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
}

/** The devices this person has turned notifications on for. */
export async function listMySubscriptions(db: Db, userId: string): Promise<MySubscription[]> {
  return db
    .select({
      endpoint: pushSubscriptions.endpoint,
      onOffline: pushSubscriptions.onOffline,
      onSummary: pushSubscriptions.onSummary,
      onUnmatched: pushSubscriptions.onUnmatched,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt));
}

/** Changes which alerts one of this person's devices gets. False when the device is not theirs. */
export async function updatePrefs(db: Db, userId: string, endpoint: string, prefs: Prefs): Promise<boolean> {
  const data = prefsSchema.parse(prefs);
  const rows = await db
    .update(pushSubscriptions)
    .set(data)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}

/** Turns notifications off for one of this person's devices. False when the device is not theirs. */
export async function removeSubscription(db: Db, userId: string, endpoint: string): Promise<boolean> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}
