import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { devices, notificationState, pushKeys, pushSubscriptions, rawPunches, shifts } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { getOrCreateVapidKeys } from "@/lib/notifications/keys";
import { runNotificationChecks } from "@/lib/notifications/run";
import { sendToSubscriptions, type WebPushLike } from "@/lib/notifications/sender";
import { listMySubscriptions, removeSubscription, saveSubscription, updatePrefs } from "@/lib/notifications/subscriptions";
import { createUser } from "@/lib/users";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

const KEY = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";
const endpointFor = (path: string) => `https://fcm.googleapis.com/fcm/send/${path}`;
const input = (endpoint: string) => ({ endpoint, p256dh: KEY, auth: AUTH, userAgent: "test", onOffline: true, onSummary: true, onUnmatched: true });

class Gone extends Error {
  constructor(public statusCode: number) {
    super("push service");
  }
}

describe.skipIf(!testDatabaseUrl)("notifications", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let a: string;
  let b: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    const make = async (name: string) => (await createUser(db, { name, email: `${name}-${randomUUID()}@example.com`, password: "password-1", role: "hr" }, null)).id;
    a = await make("a");
    b = await make("b");
  });
  afterAll(() => close());

  describe("subscriptions", () => {
    it("are saved, listed for their owner only, and updated when the same device comes again", async () => {
      const endpoint = endpointFor(randomUUID());
      await saveSubscription(db, a, input(endpoint));
      await saveSubscription(db, a, { ...input(endpoint), onSummary: false });

      expect(await listMySubscriptions(db, a)).toEqual([{ endpoint, onOffline: true, onSummary: false, onUnmatched: true }]);
      expect(await listMySubscriptions(db, b)).toEqual([]);
    });

    it("move to the person using the device now", async () => {
      const endpoint = endpointFor(randomUUID());
      await saveSubscription(db, a, input(endpoint));
      await saveSubscription(db, b, input(endpoint));
      expect((await listMySubscriptions(db, a)).some((s) => s.endpoint === endpoint)).toBe(false);
      expect((await listMySubscriptions(db, b)).some((s) => s.endpoint === endpoint)).toBe(true);
    });

    it("refuse an address that is not a push service and keys that are not keys", async () => {
      await expect(saveSubscription(db, a, input("https://example.com/push"))).rejects.toThrow();
      await expect(saveSubscription(db, a, { ...input(endpointFor(randomUUID())), p256dh: "not base64!" })).rejects.toThrow();
    });

    it("change choices and turn off for their owner only", async () => {
      const endpoint = endpointFor(randomUUID());
      await saveSubscription(db, a, input(endpoint));

      expect(await updatePrefs(db, b, endpoint, { onOffline: false, onSummary: false, onUnmatched: false })).toBe(false);
      expect(await updatePrefs(db, a, endpoint, { onOffline: false, onSummary: true, onUnmatched: false })).toBe(true);
      expect((await listMySubscriptions(db, a)).find((s) => s.endpoint === endpoint)).toMatchObject({ onOffline: false, onSummary: true, onUnmatched: false });

      expect(await removeSubscription(db, b, endpoint)).toBe(false);
      expect(await removeSubscription(db, a, endpoint)).toBe(true);
      expect((await listMySubscriptions(db, a)).some((s) => s.endpoint === endpoint)).toBe(false);
    });
  });

  describe("the server's keys", () => {
    it("are made once and are the same afterwards, even when asked at the same moment", async () => {
      await db.delete(pushKeys);
      const [x, y, z] = await Promise.all([getOrCreateVapidKeys(db), getOrCreateVapidKeys(db), getOrCreateVapidKeys(db)]);
      expect(x.publicKey).toBe(y.publicKey);
      expect(y.privateKey).toBe(z.privateKey);
      expect(x.publicKey.length).toBeGreaterThan(60);
      expect(await getOrCreateVapidKeys(db)).toEqual(x);
      expect(await db.select().from(pushKeys)).toHaveLength(1);
    });
  });

  describe("sending", () => {
    it("forgets a device the push service says is gone, keeps one that only failed, and records the ones that worked", async () => {
      const ok = endpointFor(`ok-${randomUUID()}`);
      const gone = endpointFor(`gone-${randomUUID()}`);
      const broken = endpointFor(`broken-${randomUUID()}`);
      for (const endpoint of [ok, gone, broken]) await saveSubscription(db, a, input(endpoint));
      const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, a));
      const mine = rows.filter((r) => [ok, gone, broken].includes(r.endpoint));

      const sent: string[] = [];
      const webPush: WebPushLike = {
        sendNotification: async (subscription, payload, options) => {
          expect(options.vapidDetails.subject).toBe("mailto:notifications@example.com");
          if (subscription.endpoint === gone) throw new Gone(410);
          if (subscription.endpoint === broken) throw new Gone(500);
          sent.push(payload);
          return { statusCode: 201 };
        },
      };
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const result = await sendToSubscriptions(db, mine, { title: "Hello", body: "World", url: "/today", tag: "t" }, { webPush, keys: await getOrCreateVapidKeys(db), subject: "mailto:notifications@example.com" });
      // The log never carries the device's address.
      expect(JSON.stringify(error.mock.calls)).not.toContain("fcm.googleapis.com");
      error.mockRestore();

      expect(result).toEqual({ delivered: 1, removed: 1, failed: 1 });
      expect(JSON.parse(sent[0])).toEqual({ title: "Hello", body: "World", url: "/today", tag: "t" });
      const left = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, a));
      expect(left.some((r) => r.endpoint === gone)).toBe(false);
      expect(left.find((r) => r.endpoint === ok)?.lastSentAt).not.toBeNull();
      expect(left.find((r) => r.endpoint === broken)?.lastSentAt).toBeNull();
    });
  });

  describe("the checks", () => {
    // Noon today in the office: inside any shift's hours.
    const noon = () => {
      const now = new Date();
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
      return new Date(`${day}T12:00:00+06:00`);
    };

    it("tell about a quiet device once, say when it is back, and tell about an unknown code once", async () => {
      const now = noon();
      const serial = uniqueSerial("QUIET");
      const device = await addTestDevice(db, serial);
      // Heard from two hours ago.
      await db.update(devices).set({ lastSeenAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), name: `Quiet door ${serial}` }).where(eq(devices.id, device.id));
      await db.insert(shifts).values({ name: `Notify shift ${serial}`, startTime: "09:00", endTime: "18:00" });

      // One device of ours, wanting everything, and a fake push service.
      // Only this file uses push subscriptions, so the table can start empty: the one below is the only recipient.
      await db.delete(pushSubscriptions);
      const endpoint = endpointFor(`run-${randomUUID()}`);
      await saveSubscription(db, a, input(endpoint));
      const delivered: { title: string; body: string; tag: string }[] = [];
      let failing = false;
      const webPush: WebPushLike = {
        sendNotification: async (subscription, payload) => {
          if (subscription.endpoint !== endpoint) return { statusCode: 201 };
          if (failing) throw new Gone(500);
          delivered.push(JSON.parse(payload));
          return { statusCode: 201 };
        },
      };
      const mineOnly = () => delivered.filter((d) => d.tag === `offline:${serial}`);
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

      // A failed send is not remembered, so the next round tries again.
      failing = true;
      await runNotificationChecks(db, now, webPush);
      expect(await db.select().from(notificationState).where(eq(notificationState.key, `offline:${serial}`))).toHaveLength(0);
      failing = false;

      const first = await runNotificationChecks(db, now, webPush);
      expect(first.skipped).toBeUndefined();
      expect(mineOnly()).toHaveLength(1);
      expect(mineOnly()[0]).toMatchObject({ title: "Fingerprint device offline" });
      expect(mineOnly()[0].body).toContain(`Quiet door ${serial}`);

      // Not told again while it stays quiet.
      await runNotificationChecks(db, now, webPush);
      expect(mineOnly()).toHaveLength(1);

      // Heard from again: one "back" notice, and the note is cleared.
      await db.update(devices).set({ lastSeenAt: new Date(now.getTime() - 60_000) }).where(eq(devices.id, device.id));
      await runNotificationChecks(db, now, webPush);
      expect(mineOnly().map((d) => d.title)).toEqual(["Fingerprint device offline", "Fingerprint device is back"]);
      expect(await db.select().from(notificationState).where(eq(notificationState.key, `offline:${serial}`))).toHaveLength(0);
      await runNotificationChecks(db, now, webPush);
      expect(mineOnly()).toHaveLength(2);

      // An unknown code that punched today.
      const code = uniqueCode();
      await savePunches(db, [{ deviceSn: serial, empCode: code, punchedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), statusCode: 0, verifyCode: 1, rawLine: `${code} unknown` }]);
      await runNotificationChecks(db, now, webPush);
      await runNotificationChecks(db, now, webPush);
      expect(delivered.filter((d) => d.tag === `unmatched:${code}`)).toHaveLength(1);
      expect((await db.select().from(rawPunches).where(eq(rawPunches.empCode, code))).length).toBe(1);

      // A device that wants no offline alerts is not sent them.
      const before = delivered.length;
      await updatePrefs(db, a, endpoint, { onOffline: false, onSummary: false, onUnmatched: false });
      await db.update(devices).set({ lastSeenAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) }).where(eq(devices.id, device.id));
      await runNotificationChecks(db, now, webPush);
      expect(delivered).toHaveLength(before);
      error.mockRestore();
    });

    it("do nothing, and say why, when nobody has notifications on", async () => {
      await db.delete(pushSubscriptions);
      expect(await runNotificationChecks(db, noon(), { sendNotification: async () => ({ statusCode: 201 }) })).toMatchObject({ skipped: "no device has notifications on", delivered: 0 });
    });
  });
});
