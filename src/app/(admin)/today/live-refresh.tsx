"use client";

import { Pause, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { cn } from "@/lib/utils";

/** How often the board asks the server for fresh data while the tab is open. */
const REFRESH_EVERY_MS = 30_000;

function describeAge(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

/**
 * Keeps the Today screen fresh: asks the server for new data every 30 seconds
 * while the tab is visible, and straight away when you come back to it. Can be
 * paused. `generatedAt` is when the server built the page, in milliseconds.
 */
export function LiveRefresh({ generatedAt }: { generatedAt: number }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(generatedAt);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (paused) return;
    const refresh = () => startTransition(() => router.refresh());
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - generatedAt > REFRESH_EVERY_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [paused, router, generatedAt]);

  const seconds = Math.max(0, Math.floor((now - generatedAt) / 1000));

  return (
    <div className="flex items-center gap-1.5 text-xs text-forest-foreground/85">
      <span className="relative flex size-2.5 shrink-0" aria-hidden>
        {!paused ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" /> : null}
        <span className={cn("relative inline-flex size-2.5 rounded-full", paused ? "bg-forest-muted" : "bg-success")} />
      </span>
      {/* A fixed width, so the text changing from "just now" to "12 s ago" does not push the buttons around. */}
      <span role="status" aria-live="off" className="inline-block min-w-[6.5rem] tabular-nums">
        {paused ? "Paused" : "Live"}, {describeAge(seconds)}
      </span>
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        aria-label="Refresh now"
        title="Refresh now"
        className="grid size-7 place-items-center rounded-full bg-forest-line text-forest-foreground hover:bg-forest-active"
      >
        <RefreshCw className={cn("size-3.5", pending && "animate-spin")} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Resume live updates" : "Pause live updates"}
        title={paused ? "Resume live updates" : "Pause live updates"}
        className="grid size-7 place-items-center rounded-full bg-forest-line text-forest-foreground hover:bg-forest-active"
      >
        {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
      </button>
    </div>
  );
}
