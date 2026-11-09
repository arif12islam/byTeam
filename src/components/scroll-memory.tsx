"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  pathOf,
  planRestore,
  readScroll,
  saveScroll,
  setPreviousKey,
  shouldRestore,
  takeRestoreRequest,
  type Arrival,
  type ScrollStore,
} from "@/lib/scroll-memory";

function sessionStore(): ScrollStore | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

const currentKey = () => window.location.pathname + window.location.search;

/** A link click or form submit counts as "going somewhere new" for this long. */
const FRESH_MS = 10_000;

/**
 * Puts a page back where it was when someone returns to it with the browser's
 * back button or a Back link: the page itself, and how far down it was
 * scrolled. Pages fill in after they open, so the browser's own restoring
 * jumps before there is anything to scroll to; this waits until the page is
 * tall enough. A plain link (the menu, a tab) still opens at the top.
 *
 * A return is any navigation that did not start with a click on a link or a
 * form submit. The router shows the new page before the browser's popstate
 * event reaches the page, so popstate cannot be used to tell.
 * Renders nothing.
 */
export function ScrollMemory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const key = search ? `${pathname}?${search}` : pathname;

  /** The page on screen. Scroll is only recorded while the address and this agree, so a page that is still being swapped in cannot overwrite the place saved for it. */
  const shownKey = useRef<string | null>(null);
  const linkAt = useRef<number | null>(null);
  const firstArrival = useRef<Arrival | null>(null);

  // Once: remember the place as it changes, and notice links being used.
  useEffect(() => {
    const store = sessionStore();
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      // Some browsers do not allow it; the page then opens where the browser puts it.
    }
    const navigationType = (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type;
    firstArrival.current = navigationType === "reload" ? "reload" : navigationType === "back_forward" ? "history" : "link";

    let frame = 0;
    let pending: { key: string; y: number } | null = null;
    const write = () => {
      frame = 0;
      if (pending) saveScroll(store, pending.key, pending.y);
      pending = null;
    };
    const onScroll = () => {
      const now = currentKey();
      if (now !== shownKey.current) return;
      pending = { key: now, y: window.scrollY };
      frame ||= requestAnimationFrame(write);
    };
    const saveNow = () => {
      const now = currentKey();
      if (now !== shownKey.current) return;
      pending = null;
      saveScroll(store, now, window.scrollY);
    };
    const onClick = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest?.("a[href]")) return;
      saveNow();
      linkAt.current = Date.now();
    };
    const onSubmit = () => {
      saveNow();
      linkAt.current = Date.now();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") saveNow();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  // On every new page: note where we came from, and put the page back if this is a return.
  useEffect(() => {
    const store = sessionStore();
    if (shownKey.current !== null && shownKey.current !== key) setPreviousKey(store, shownKey.current);
    const first = shownKey.current === null;
    shownKey.current = key;

    const requested = takeRestoreRequest(store);
    let how: Arrival;
    if (requested !== null && pathOf(requested) === pathOf(key)) how = "back-link";
    else if (first) how = firstArrival.current ?? "link";
    else how = linkAt.current !== null && Date.now() - linkAt.current < FRESH_MS ? "link" : "history";
    linkAt.current = null;
    if (!shouldRestore(how, window.location.hash !== "")) return;

    const savedY = readScroll(store, key);
    if (savedY === null || savedY <= 0) {
      // A Back link keeps the scroll of the page it left; a page we have no place for opens at the top.
      if (how === "back-link") window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    let userScrolled = false;
    const stopOnUser = () => {
      userScrolled = true;
    };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const name of events) window.addEventListener(name, stopOnUser, { passive: true });

    const started = performance.now();
    let jumpedAt: number | null = null;
    let frame = 0;
    const step = () => {
      const now = performance.now();
      const plan = planRestore({
        savedY,
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        elapsedMs: now - started,
        userScrolled,
      });
      if (plan.do === "stop") return;
      if (plan.do === "jump") {
        if (Math.abs(window.scrollY - plan.y) > 2) window.scrollTo({ top: plan.y, behavior: "instant" });
        jumpedAt ??= now;
      }
      // After the jump, keep it in place briefly: the page can still be filling in or the router can still be settling.
      if (jumpedAt !== null && now - jumpedAt > 500) return;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      for (const name of events) window.removeEventListener(name, stopOnUser);
    };
  }, [key]);

  return null;
}
