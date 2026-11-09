import { eq, inArray } from "drizzle-orm";
import { sendNotification } from "web-push";

import type { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";

import type { Alert } from "./rules";
import type { VapidKeys } from "./keys";

type Db = ReturnType<typeof getDb>;

type SubscriptionRow = typeof pushSubscriptions.$inferSelect;

/** The part of the web-push library this code uses, so tests can stand in for it. */
export type WebPushLike = {
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options: { vapidDetails: { subject: string; publicKey: string; privateKey: string }; TTL: number; urgency: "low" | "normal" | "high" },
  ): Promise<{ statusCode: number }>;
};

export const realWebPush: WebPushLike = {
  sendNotification: (subscription, payload, options) => sendNotification(subscription, payload, options),
};

/**
 * Who the push service says sent this: a web address or a mailto. The app's own
 * address when it has one, else a placeholder that push services accept.
 */
export function vapidSubject(appUrl: string | undefined = process.env.BETTER_AUTH_URL): string {
  try {
    const url = new URL(appUrl ?? "");
    if (url.protocol === "https:") return url.origin;
  } catch {
    // Fall through to the placeholder.
  }
  return "mailto:notifications@example.com";
}

export type PushPayload = { title: string; body: string; url: string; tag: string };

export type SendSummary = { delivered: number; removed: number; failed: number };

export const EMPTY_SEND: SendSummary = { delivered: 0, removed: 0, failed: 0 };

/**
 * Sends one notification to each subscription. A device the push service says
 * is gone (404 or 410: the app was removed, or notifications were switched
 * off) is forgotten. Any other failure is counted and logged without the
 * device's address, which is a secret.
 */
export async function sendToSubscriptions(
  db: Db,
  subscriptions: readonly SubscriptionRow[],
  payload: PushPayload,
  deps: { webPush: WebPushLike; keys: VapidKeys; subject: string },
): Promise<SendSummary> {
  const summary: SendSummary = { ...EMPTY_SEND };
  const gone: string[] = [];
  const deliveredIds: string[] = [];
  const body = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    try {
      await deps.webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, body, {
        vapidDetails: { subject: deps.subject, publicKey: deps.keys.publicKey, privateKey: deps.keys.privateKey },
        TTL: 60 * 60,
        urgency: "normal",
      });
      summary.delivered += 1;
      deliveredIds.push(subscription.id);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        gone.push(subscription.id);
        summary.removed += 1;
      } else {
        summary.failed += 1;
        console.error(`[notifications] a push failed with status ${status ?? "unknown"}`);
      }
    }
  }

  if (gone.length > 0) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  if (deliveredIds.length > 0) await db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(inArray(pushSubscriptions.id, deliveredIds));
  return summary;
}

/** Sends an alert to every device that wants that kind of alert. */
export async function sendAlert(db: Db, alert: Alert, deps: { webPush: WebPushLike; keys: VapidKeys; subject: string }): Promise<SendSummary & { recipients: number }> {
  const wants = { offline: pushSubscriptions.onOffline, summary: pushSubscriptions.onSummary, unmatched: pushSubscriptions.onUnmatched }[alert.kind];
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(wants, true));
  const result = await sendToSubscriptions(db, subscriptions, { title: alert.title, body: alert.body, url: alert.url, tag: alert.tag }, deps);
  return { ...result, recipients: subscriptions.length };
}
