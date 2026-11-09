"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { getOrCreateVapidKeys } from "@/lib/notifications/keys";
import { listMySubscriptions, removeSubscription, saveSubscription, updatePrefs, type Prefs } from "@/lib/notifications/subscriptions";
import { realWebPush, sendToSubscriptions, vapidSubject } from "@/lib/notifications/sender";
import { pushSubscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";

export type PushResult = { ok: true; message?: string; publicKey?: string } | { ok: false; error: string };

const checked = (formData: FormData, name: string) => formData.get(name) === "on" || formData.get(name) === "true";

function prefsFrom(formData: FormData): Prefs {
  return { onOffline: checked(formData, "onOffline"), onSummary: checked(formData, "onSummary"), onUnmatched: checked(formData, "onUnmatched") };
}

/** The server's public key, which the browser needs to subscribe. Makes the keys the first time. */
export async function getPushPublicKeyAction(): Promise<PushResult> {
  await requireRole("owner", "hr");
  const keys = await getOrCreateVapidKeys(getDb());
  return { ok: true, publicKey: keys.publicKey };
}

/** Saves the subscription a browser just made, with the alerts it wants. */
export async function savePushSubscriptionAction(formData: FormData): Promise<PushResult> {
  const user = await requireRole("owner", "hr");

  try {
    await saveSubscription(getDb(), user.id, {
      endpoint: String(formData.get("endpoint") ?? ""),
      p256dh: String(formData.get("p256dh") ?? ""),
      auth: String(formData.get("auth") ?? ""),
      userAgent: String(formData.get("userAgent") ?? "").slice(0, 300),
      ...prefsFrom(formData),
    });
  } catch {
    return { ok: false, error: "This device sent something byTeam could not use. Turn notifications off and on again." };
  }
  revalidatePath("/settings");
  return { ok: true, message: "Notifications are on for this device." };
}

/** Changes which alerts this device gets. */
export async function savePushPrefsAction(formData: FormData): Promise<PushResult> {
  const user = await requireRole("owner", "hr");

  const saved = await updatePrefs(getDb(), user.id, String(formData.get("endpoint") ?? ""), prefsFrom(formData));
  if (!saved) return { ok: false, error: "This device is not set up for notifications. Turn them on first." };
  revalidatePath("/settings");
  return { ok: true, message: "Saved." };
}

/** Turns notifications off for this device. */
export async function removePushSubscriptionAction(formData: FormData): Promise<PushResult> {
  const user = await requireRole("owner", "hr");

  await removeSubscription(getDb(), user.id, String(formData.get("endpoint") ?? ""));
  revalidatePath("/settings");
  return { ok: true, message: "Notifications are off for this device." };
}

/** Sends a test notification to this device, so you can see it work. */
export async function sendTestPushAction(formData: FormData): Promise<PushResult> {
  const user = await requireRole("owner", "hr");

  const db = getDb();
  const endpoint = String(formData.get("endpoint") ?? "");
  const mine = (await listMySubscriptions(db, user.id)).find((s) => s.endpoint === endpoint);
  if (!mine) return { ok: false, error: "This device is not set up for notifications. Turn them on first." };

  const [row] = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  const result = await sendToSubscriptions(
    db,
    [row],
    { title: "byTeam notifications work", body: "You will see alerts like this one on this device.", url: "/settings?tab=notifications", tag: "test" },
    { webPush: realWebPush, keys: await getOrCreateVapidKeys(db), subject: vapidSubject() },
  );
  if (result.delivered === 0) {
    return { ok: false, error: "The notification could not be delivered. Turn notifications off and on again on this device." };
  }
  return { ok: true, message: "Sent. It should appear in a moment." };
}
