import { describe, expect, it } from "vitest";

import {
  backLinkCanGoBack,
  getPreviousKey,
  MAX_AGE_MS,
  MAX_ENTRIES,
  pathOf,
  planRestore,
  readScroll,
  requestRestore,
  RESTORE_TIMEOUT_MS,
  saveScroll,
  setPreviousKey,
  shouldRestore,
  takeRestoreRequest,
  type ScrollStore,
} from "@/lib/scroll-memory";

function memoryStore(): ScrollStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const brokenStore: ScrollStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("full");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("saved places", () => {
  it("remembers a place per page and gives it back", () => {
    const store = memoryStore();
    saveScroll(store, "/attendance?month=2026-11", 1234.6, 1000);
    saveScroll(store, "/employees", 80, 1000);
    expect(readScroll(store, "/attendance?month=2026-11", 2000)).toBe(1235);
    expect(readScroll(store, "/employees", 2000)).toBe(80);
    expect(readScroll(store, "/reports", 2000)).toBeNull();
  });

  it("forgets a place after two hours", () => {
    const store = memoryStore();
    saveScroll(store, "/a", 500, 0);
    expect(readScroll(store, "/a", MAX_AGE_MS)).toBe(500);
    expect(readScroll(store, "/a", MAX_AGE_MS + 1)).toBeNull();
  });

  it("keeps at most 50 pages, dropping the oldest", () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_ENTRIES + 5; i += 1) saveScroll(store, `/p${i}`, 100 + i, 1000);
    expect(readScroll(store, "/p0", 1000)).toBeNull();
    expect(readScroll(store, "/p4", 1000)).toBeNull();
    expect(readScroll(store, "/p5", 1000)).toBe(105);
    expect(readScroll(store, `/p${MAX_ENTRIES + 4}`, 1000)).toBe(100 + MAX_ENTRIES + 4);
  });

  it("ignores bad numbers and negative places", () => {
    const store = memoryStore();
    saveScroll(store, "/a", Number.NaN, 0);
    expect(readScroll(store, "/a", 0)).toBeNull();
    saveScroll(store, "/a", -50, 0);
    expect(readScroll(store, "/a", 0)).toBe(0);
  });

  it("copes with corrupt data, blocked storage and no storage", () => {
    const store = memoryStore();
    store.setItem("byteam.scroll", "{not json");
    expect(readScroll(store, "/a", 0)).toBeNull();
    saveScroll(store, "/a", 10, 0);
    expect(readScroll(store, "/a", 0)).toBe(10);

    expect(() => saveScroll(brokenStore, "/a", 10, 0)).not.toThrow();
    expect(readScroll(brokenStore, "/a", 0)).toBeNull();
    expect(() => requestRestore(brokenStore, "/a")).not.toThrow();
    expect(takeRestoreRequest(brokenStore)).toBeNull();
    expect(() => setPreviousKey(brokenStore, "/a")).not.toThrow();
    expect(getPreviousKey(brokenStore)).toBeNull();

    saveScroll(undefined, "/a", 10, 0);
    expect(readScroll(undefined, "/a", 0)).toBeNull();
    expect(takeRestoreRequest(undefined)).toBeNull();
  });
});

describe("the restore request", () => {
  it("works once", () => {
    const store = memoryStore();
    requestRestore(store, "/attendance");
    expect(takeRestoreRequest(store)).toBe("/attendance");
    expect(takeRestoreRequest(store)).toBeNull();
  });
});

describe("Back links", () => {
  it("go back in the history only when that lands on the page they point to", () => {
    expect(backLinkCanGoBack("/attendance", "/attendance?month=2026-11")).toBe(true);
    expect(backLinkCanGoBack("/attendance?from=2026-10-01&to=2026-10-31", "/attendance?month=2026-11")).toBe(true);
    expect(backLinkCanGoBack("/today", "/attendance?month=2026-11")).toBe(false);
    expect(backLinkCanGoBack(null, "/attendance")).toBe(false);
  });

  it("reads the path without query or hash", () => {
    expect(pathOf("/attendance/abc?month=2026-11#top")).toBe("/attendance/abc");
  });
});

describe("shouldRestore", () => {
  it("restores for history, a Back link and a reload, not a plain link or a link to a heading", () => {
    expect(shouldRestore("history", false)).toBe(true);
    expect(shouldRestore("back-link", false)).toBe(true);
    expect(shouldRestore("reload", false)).toBe(true);
    expect(shouldRestore("link", false)).toBe(false);
    expect(shouldRestore("history", true)).toBe(false);
  });
});

describe("planRestore", () => {
  const base = { savedY: 1500, scrollHeight: 4000, viewportHeight: 800, elapsedMs: 0, userScrolled: false };

  it("jumps when the page is tall enough", () => {
    expect(planRestore(base)).toEqual({ do: "jump", y: 1500 });
    expect(planRestore({ ...base, savedY: 3200 })).toEqual({ do: "jump", y: 3200 });
  });

  it("waits while the page is still loading, then jumps once it has grown", () => {
    const loading = { ...base, scrollHeight: 900, elapsedMs: 200 };
    expect(planRestore(loading)).toEqual({ do: "wait" });
    expect(planRestore({ ...loading, scrollHeight: 2600, elapsedMs: 400 })).toEqual({ do: "jump", y: 1500 });
  });

  it("goes as far down as it can at the time limit, or stops if the page cannot scroll", () => {
    expect(planRestore({ ...base, scrollHeight: 1800, elapsedMs: RESTORE_TIMEOUT_MS })).toEqual({ do: "jump", y: 1000 });
    expect(planRestore({ ...base, scrollHeight: 700, elapsedMs: RESTORE_TIMEOUT_MS })).toEqual({ do: "stop" });
  });

  it("does nothing when there is no saved place or the person is already scrolling", () => {
    expect(planRestore({ ...base, savedY: 0 })).toEqual({ do: "stop" });
    expect(planRestore({ ...base, userScrolled: true })).toEqual({ do: "stop" });
  });
});
