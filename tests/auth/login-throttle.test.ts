import { describe, expect, it } from "vitest";

import {
  createLoginThrottle,
  describeThrottle,
  LOGIN_WINDOW_MS,
  MAX_FAILURES_PER_ACCOUNT,
  MAX_FAILURES_PER_ADDRESS,
} from "@/lib/login-throttle";
import { ipFromHeaders } from "@/lib/rate-limit";

function clock(start = 5_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const IP = "203.0.113.9";
const EMAIL = "owner@example.test";

function fail(throttle: ReturnType<typeof createLoginThrottle>, times: number, ip = IP, email = EMAIL) {
  for (let i = 0; i < times; i += 1) throttle.failed(ip, email);
}

describe("sign in throttle", () => {
  it("lets a person who mistypes a few times try again", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    expect(throttle.check(IP, EMAIL)).toEqual({ allowed: true });
    fail(throttle, MAX_FAILURES_PER_ACCOUNT - 1);
    expect(throttle.check(IP, EMAIL)).toEqual({ allowed: true });
  });

  it("turns the pair away after 10 failures, with how long to wait", () => {
    const c = clock();
    const throttle = createLoginThrottle({ now: c.now });
    fail(throttle, MAX_FAILURES_PER_ACCOUNT);
    expect(throttle.check(IP, EMAIL)).toEqual({ allowed: false, retryAfterSeconds: LOGIN_WINDOW_MS / 1000 });
    c.advance(5 * 60_000);
    expect(throttle.check(IP, EMAIL)).toEqual({ allowed: false, retryAfterSeconds: 10 * 60 });
  });

  it("is open again after 15 minutes", () => {
    const c = clock();
    const throttle = createLoginThrottle({ now: c.now });
    fail(throttle, MAX_FAILURES_PER_ACCOUNT);
    c.advance(LOGIN_WINDOW_MS);
    expect(throttle.check(IP, EMAIL)).toEqual({ allowed: true });
  });

  it("does not lock out the same account from another address, or another account from this address", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    fail(throttle, MAX_FAILURES_PER_ACCOUNT);
    expect(throttle.check("198.51.100.4", EMAIL)).toEqual({ allowed: true });
    expect(throttle.check(IP, "hr@example.test")).toEqual({ allowed: true });
  });

  it("treats capital letters and spaces in the email as the same account", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i += 1) throttle.failed(IP, i % 2 ? "  OWNER@Example.test " : EMAIL);
    expect(throttle.check(IP, "Owner@example.TEST").allowed).toBe(false);
  });

  it("turns an address away after 30 failures across different emails", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < MAX_FAILURES_PER_ADDRESS; i += 1) throttle.failed(IP, `person${i}@example.test`);
    // No single email reached 10, but the address did.
    expect(throttle.check(IP, "brand-new@example.test").allowed).toBe(false);
    expect(throttle.check("198.51.100.4", "brand-new@example.test").allowed).toBe(true);
  });

  it("a good sign in clears that account's count, so a slip is not held against the person", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    fail(throttle, MAX_FAILURES_PER_ACCOUNT - 1);
    throttle.succeeded(IP, EMAIL);
    fail(throttle, MAX_FAILURES_PER_ACCOUNT - 1);
    expect(throttle.check(IP, EMAIL)).toEqual({ allowed: true });
  });

  it("a good sign in does not clear the address count, so a guesser cannot reset it with their own account", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < MAX_FAILURES_PER_ADDRESS; i += 1) throttle.failed(IP, `person${i}@example.test`);
    throttle.succeeded(IP, "attacker@example.test");
    expect(throttle.check(IP, "attacker@example.test").allowed).toBe(false);
  });

  it("counts failures only, so a person signing in all day is never held up", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    for (let i = 0; i < 100; i += 1) {
      expect(throttle.check(IP, EMAIL).allowed).toBe(true);
      throttle.succeeded(IP, EMAIL);
    }
  });

  it("is not fooled by a huge email: it makes one bounded key", () => {
    const throttle = createLoginThrottle({ now: clock().now });
    const huge = `${"a".repeat(5000)}@example.test`;
    fail(throttle, MAX_FAILURES_PER_ACCOUNT, IP, huge);
    expect(throttle.check(IP, `${huge}x`).allowed).toBe(false); // same first 254 characters
  });
});

describe("describeThrottle", () => {
  it("says how many minutes to wait, at least one", () => {
    expect(describeThrottle(900)).toBe("Too many sign in attempts. Wait 15 minutes and try again.");
    expect(describeThrottle(61)).toBe("Too many sign in attempts. Wait 2 minutes and try again.");
    expect(describeThrottle(1)).toBe("Too many sign in attempts. Wait 1 minute and try again.");
  });
});

describe("ipFromHeaders", () => {
  it("reads the forwarded address, then the real address, else one shared bucket", () => {
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(ipFromHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(ipFromHeaders(new Headers())).toBe("unknown");
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "<script>" }))).toBe("unknown");
  });
});
