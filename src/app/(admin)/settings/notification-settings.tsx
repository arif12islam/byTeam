"use client";

import { Bell, BellOff } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { MySubscription, Prefs } from "@/lib/notifications/subscriptions";

import {
  getPushPublicKeyAction,
  removePushSubscriptionAction,
  savePushPrefsAction,
  savePushSubscriptionAction,
  sendTestPushAction,
  type PushResult,
} from "./push-actions";

type Support = "checking" | "unsupported" | "needs_home_screen" | "denied" | "ready";

const CHOICES: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "onOffline", label: "Fingerprint device offline", hint: "When the device or the office laptop has gone quiet in office hours, and when it is back." },
  { key: "onSummary", label: "Morning summary", hint: "Who is in, late, absent or on leave, once each working day at about 10:00." },
  { key: "onUnmatched", label: "Unknown code punched", hint: "When someone punches with a code that is not linked to an employee." },
];

/** The key the browser needs, from the text the server hands out. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function form(values: Record<string, string | boolean>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, typeof value === "boolean" ? (value ? "on" : "") : value);
  return data;
}

/**
 * Turn push notifications on or off for this phone or browser, and choose what
 * it gets. Works from the Home Screen app on an iPhone, and in the browser on
 * Android and computers.
 */
export function NotificationSettings({ subscriptions }: { subscriptions: MySubscription[] }) {
  const [support, setSupport] = useState<Support>("checking");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  // What the person has changed since the page loaded; until then, what is saved for this device.
  const [edited, setEdited] = useState<Prefs | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const mine = endpoint ? subscriptions.find((s) => s.endpoint === endpoint) : undefined;
  const prefs: Prefs = edited ?? (mine ? { onOffline: mine.onOffline, onSummary: mine.onSummary, onUnmatched: mine.onUnmatched } : { onOffline: true, onSummary: true, onUnmatched: true });

  // What this device can do, and whether it is already subscribed.
  useEffect(() => {
    void (async () => {
      const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (!capable) return setSupport(iPhone && !standalone ? "needs_home_screen" : "unsupported");
      if (Notification.permission === "denied") return setSupport("denied");
      setSupport("ready");
      const registration = await navigator.serviceWorker.getRegistration("/");
      const existing = await registration?.pushManager.getSubscription();
      setEndpoint(existing?.endpoint ?? null);
    })();
  }, []);

  const report = useCallback((result: PushResult, fallback?: string) => {
    setMessage(result.ok ? { text: result.message ?? fallback ?? "Done.", error: false } : { text: result.error, error: true });
  }, []);

  const turnOn = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        if ((await Notification.requestPermission()) !== "granted") {
          setSupport("denied");
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const key = await getPushPublicKeyAction();
        if (!key.ok || !key.publicKey) return report(key);

        // A subscription made with another key has to go before a new one can be made.
        await (await registration.pushManager.getSubscription())?.unsubscribe();
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.publicKey) });
        const json = subscription.toJSON();
        const saved = await savePushSubscriptionAction(
          form({
            endpoint: subscription.endpoint,
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
            userAgent: navigator.userAgent,
            ...prefs,
          }),
        );
        if (saved.ok) setEndpoint(subscription.endpoint);
        report(saved);
      } catch {
        setMessage({ text: "Could not turn notifications on here. Reload the page and try again.", error: true });
      }
    });

  const turnOff = () =>
    startTransition(async () => {
      setMessage(null);
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const address = subscription?.endpoint ?? endpoint;
      await subscription?.unsubscribe();
      if (address) report(await removePushSubscriptionAction(form({ endpoint: address })));
      setEndpoint(null);
    });

  const savePrefs = () =>
    startTransition(async () => {
      if (endpoint) report(await savePushPrefsAction(form({ endpoint, ...prefs })));
    });

  const sendTest = () =>
    startTransition(async () => {
      if (endpoint) report(await sendTestPushAction(form({ endpoint })));
    });

  if (support === "checking") return <p className="text-sm text-muted-foreground">Checking this device</p>;
  if (support === "unsupported") {
    return <p className="rounded-md border border-dashed border-input p-3 text-sm text-muted-foreground">This browser cannot show notifications. Try Chrome on Android, or Safari from the Home Screen on an iPhone.</p>;
  }
  if (support === "needs_home_screen") {
    return (
      <p className="rounded-md border border-dashed border-input p-3 text-sm text-muted-foreground">
        On an iPhone, notifications work from the Home Screen app. Tap Share, then Add to Home Screen, open byTeam from the new icon, and come back to this page.
      </p>
    );
  }
  if (support === "denied") {
    return (
      <p role="status" className="rounded-md border border-dashed border-input p-3 text-sm text-muted-foreground">
        Notifications are blocked for byTeam on this device. Allow them in the phone or browser settings, then reload this page.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {endpoint && mine ? (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">This device gets</legend>
            {CHOICES.map((choice) => (
              <label key={choice.key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-input bg-card p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                <input type="checkbox" checked={prefs[choice.key]} onChange={(event) => setEdited({ ...prefs, [choice.key]: event.target.checked })} className="mt-0.5 size-4 accent-primary" />
                <span>
                  <span className="font-medium">{choice.label}</span>
                  <span className="block text-xs text-muted-foreground">{choice.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={savePrefs} pending={pending}>
              Save choices
            </Button>
            <Button type="button" variant="outline" onClick={sendTest} pending={pending}>
              <Bell aria-hidden />
              Send a test
            </Button>
            <Button type="button" variant="ghost" onClick={turnOff} pending={pending}>
              <BellOff aria-hidden />
              Turn off on this device
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" onClick={turnOn} pending={pending}>
          <Bell aria-hidden />
          Turn on notifications on this device
        </Button>
      )}
      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-primary"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
