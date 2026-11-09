/**
 * Remembering where on a page someone was, so going back puts them there.
 * Everything here is pure or takes the storage as an argument, so it can be
 * tested without a browser. The browser part is src/components/scroll-memory.tsx.
 */

/** The part of Storage that is used, so a test can pass a plain object. */
export type ScrollStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const POSITIONS_KEY = "byteam.scroll";
const RESTORE_ONCE_KEY = "byteam.scroll.restore-once";
const PREVIOUS_KEY = "byteam.scroll.previous";

/** Most pages remembered at once, oldest dropped first. */
export const MAX_ENTRIES = 50;
/** A saved place is forgotten after this long. */
export const MAX_AGE_MS = 2 * 60 * 60 * 1000;

type Entry = { y: number; at: number };
type Positions = Record<string, Entry>;

function readAll(store: ScrollStore | undefined): Positions {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(POSITIONS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Positions) : {};
  } catch {
    return {};
  }
}

function writeAll(store: ScrollStore | undefined, positions: Positions): void {
  try {
    store?.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    // Storage is full or blocked (a private window): remembering is a convenience, so carry on without it.
  }
}

/** Remembers how far down the page at `key` (path and query) someone had scrolled. */
export function saveScroll(store: ScrollStore | undefined, key: string, y: number, now = Date.now()): void {
  if (!store || !Number.isFinite(y)) return;
  const positions = readAll(store);
  delete positions[key];
  positions[key] = { y: Math.max(0, Math.round(y)), at: now };
  const keys = Object.keys(positions);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete positions[old];
  writeAll(store, positions);
}

/** The remembered place for `key`, or null when there is none or it is too old. */
export function readScroll(store: ScrollStore | undefined, key: string, now = Date.now()): number | null {
  const entry = readAll(store)[key];
  if (!entry || typeof entry.y !== "number" || typeof entry.at !== "number") return null;
  return now - entry.at > MAX_AGE_MS ? null : entry.y;
}

/** Asks for the next page shown at `key` to be put back where it was, as when a Back link is used. */
export function requestRestore(store: ScrollStore | undefined, key: string): void {
  try {
    store?.setItem(RESTORE_ONCE_KEY, key);
  } catch {
    // Nothing to do: the page just opens at the top.
  }
}

/** The key a Back link asked to restore, if any. Reading it clears it, so it only works once. */
export function takeRestoreRequest(store: ScrollStore | undefined): string | null {
  try {
    const key = store?.getItem(RESTORE_ONCE_KEY) ?? null;
    if (key !== null) store?.removeItem(RESTORE_ONCE_KEY);
    return key;
  } catch {
    return null;
  }
}

/** The page shown before this one, kept so a Back link can tell whether going back goes where it points. */
export function setPreviousKey(store: ScrollStore | undefined, key: string): void {
  try {
    store?.setItem(PREVIOUS_KEY, key);
  } catch {
    // Without it a Back link just opens its page.
  }
}

export function getPreviousKey(store: ScrollStore | undefined): string | null {
  try {
    return store?.getItem(PREVIOUS_KEY) ?? null;
  } catch {
    return null;
  }
}

/** The path part of a key or link: no query, no hash. */
export function pathOf(keyOrHref: string): string {
  return keyOrHref.split("#")[0].split("?")[0];
}

/** True when going back in the browser history lands on the page the Back link points to. */
export function backLinkCanGoBack(previousKey: string | null, href: string): boolean {
  return previousKey !== null && pathOf(previousKey) === pathOf(href);
}

export type Arrival = "history" | "back-link" | "reload" | "link";

/**
 * Whether to put the page back where it was on arrival. Browser back and
 * forward, a Back link and a reload do. A plain link (sidebar, tab bar, a new
 * page) starts at the top, and a link to a heading in the page is left alone.
 */
export function shouldRestore(arrival: Arrival, hasHash: boolean): boolean {
  return !hasHash && arrival !== "link";
}

export type RestoreState = {
  savedY: number;
  /** The height of the whole page now. */
  scrollHeight: number;
  viewportHeight: number;
  elapsedMs: number;
  /** The person has started scrolling themselves. */
  userScrolled: boolean;
};

export type RestoreStep = { do: "jump"; y: number } | { do: "wait" } | { do: "stop" };

/** How long to wait for a page that is still loading to become tall enough. */
export const RESTORE_TIMEOUT_MS = 3000;

/** One step of putting the page back: jump when it is tall enough, wait while it loads, give up at the limit or when the person scrolls. */
export function planRestore(state: RestoreState): RestoreStep {
  if (state.userScrolled || state.savedY <= 0) return { do: "stop" };
  const maxY = Math.max(0, state.scrollHeight - state.viewportHeight);
  if (state.savedY <= maxY) return { do: "jump", y: state.savedY };
  // Not tall enough yet. After the limit, go as far down as the page goes rather than staying at the top.
  return state.elapsedMs >= RESTORE_TIMEOUT_MS ? (maxY > 0 ? { do: "jump", y: maxY } : { do: "stop" }) : { do: "wait" };
}
