import { describe, expect, it } from "vitest";

import { clientIp, createAdmsGuard, createRateLimiter, DEVICE_LIMIT, REFUSED_LIMIT } from "@/lib/adms/rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const request = (ip: string | null, serial = "SIM0000001") =>
  new Request(`http://localhost/iclock/getrequest?SN=${serial}`, { headers: ip === null ? {} : { "x-forwarded-for": ip } });

describe("createRateLimiter", () => {
  it("lets the limit through and turns the next one away, with how long to wait", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect([1, 2, 3].map(() => limiter.hit("a").allowed)).toEqual([true, true, true]);
    expect(limiter.hit("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    c.advance(20_500);
    expect(limiter.hit("a")).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it("starts a fresh window once the old one is over", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: c.now });
    limiter.hit("a");
    limiter.hit("a");
    expect(limiter.hit("a").allowed).toBe(false);
    c.advance(60_000);
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(false);
  });

  it("counts each key on its own", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
    expect(limiter.hit("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(false);
    expect(limiter.hit("b").allowed).toBe(true);
  });

  it("peek tells the state without counting", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: clock().now });
    for (let i = 0; i < 10; i += 1) expect(limiter.peek("a").allowed).toBe(true);
    limiter.hit("a");
    limiter.hit("a");
    expect(limiter.peek("a").allowed).toBe(true); // exactly at the limit is still fine
    limiter.hit("a");
    expect(limiter.peek("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("reset forgets a key at once", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
    limiter.hit("a");
    limiter.hit("a");
    expect(limiter.peek("a").allowed).toBe(false);
    limiter.reset("a");
    expect(limiter.peek("a").allowed).toBe(true);
    expect(limiter.hit("a").allowed).toBe(true);
    limiter.reset("never-seen");
  });

  it("does not track more keys than it should when addresses are made up", () => {
    const c = clock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    for (let i = 0; i < 12_000; i += 1) limiter.hit(`k${i}`);
    expect(limiter.size()).toBeLessThanOrEqual(10_000);
    // Everything expired is dropped when the next new key arrives.
    c.advance(61_000);
    limiter.hit("fresh");
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});

describe("clientIp", () => {
  it("takes the first address of x-forwarded-for, then x-real-ip", () => {
    expect(clientIp(request("203.0.113.9, 10.0.0.1"))).toBe("203.0.113.9");
    expect(clientIp(new Request("http://x/", { headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(clientIp(request("2001:db8::1"))).toBe("2001:db8::1");
  });

  it("puts a missing or odd value in one shared bucket", () => {
    expect(clientIp(request(null))).toBe("unknown");
    expect(clientIp(request("not an address <script>"))).toBe("unknown");
    expect(clientIp(request("x".repeat(100)))).toBe("unknown");
  });
});

describe("createAdmsGuard", () => {
  it("lets a normal device through all day", () => {
    const c = clock();
    const guard = createAdmsGuard({ now: c.now });
    // A poll every 30 seconds for an hour, with punches in between.
    for (let i = 0; i < 120; i += 1) {
      expect(guard.check(request("203.0.113.9"), "SIM0000001")).toBeNull();
      c.advance(30_000);
    }
  });

  it("turns a flood from one device away with 429 and Retry-After, and recovers", async () => {
    const c = clock();
    const guard = createAdmsGuard({ now: c.now });
    for (let i = 0; i < DEVICE_LIMIT.limit; i += 1) expect(guard.check(request("203.0.113.9"), "SIM0000001")).toBeNull();

    const response = guard.check(request("203.0.113.9"), "SIM0000001");
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    expect(await response?.text()).toBe("ERROR: too many requests\n");

    // Another device, and the same serial from another address, are not affected.
    expect(guard.check(request("203.0.113.9"), "SIM0000002")).toBeNull();
    expect(guard.check(request("198.51.100.5"), "SIM0000001")).toBeNull();

    c.advance(60_000);
    expect(guard.check(request("203.0.113.9"), "SIM0000001")).toBeNull();
  });

  it("blocks an address that keeps being refused, before any lookup, for everything it sends", () => {
    const c = clock();
    const guard = createAdmsGuard({ now: c.now });
    const scanner = request("192.0.2.77", "GUESS00001");
    for (let i = 0; i < REFUSED_LIMIT.limit; i += 1) {
      expect(guard.check(scanner, "GUESS00001")).toBeNull();
      guard.noteRefused(scanner);
    }
    // Exactly at the limit is still allowed through to be refused again; the next one is blocked.
    expect(guard.check(scanner, "GUESS00001")).toBeNull();
    guard.noteRefused(scanner);
    expect(guard.check(scanner, "GUESS00002")?.status).toBe(429);
    expect(guard.check(request("192.0.2.77"), null)?.status).toBe(429);
  });

  it("does not let one address's refusals block another", () => {
    const guard = createAdmsGuard({ now: clock().now });
    for (let i = 0; i < REFUSED_LIMIT.limit + 5; i += 1) guard.noteRefused(request("192.0.2.77"));
    expect(guard.check(request("192.0.2.77"), "SIM0000001")?.status).toBe(429);
    expect(guard.check(request("203.0.113.9"), "SIM0000001")).toBeNull();
  });

  it("forgets the refusals after a minute", () => {
    const c = clock();
    const guard = createAdmsGuard({ now: c.now });
    for (let i = 0; i < REFUSED_LIMIT.limit + 1; i += 1) guard.noteRefused(request("192.0.2.77"));
    expect(guard.check(request("192.0.2.77"), "SIM0000001")?.status).toBe(429);
    c.advance(60_001);
    expect(guard.check(request("192.0.2.77"), "SIM0000001")).toBeNull();
  });
});
