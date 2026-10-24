/**
 * Rate limits for the /iclock device routes. The limiter itself is in
 * `src/lib/rate-limit.ts`.
 *
 * A real device sends a few requests a minute: a poll every 30 seconds and a
 * punch as it happens. The limits are many times that.
 */

export { clientIp, createRateLimiter, type RateDecision, type RateLimiter } from "@/lib/rate-limit";

import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const DEVICE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
export const REFUSED_LIMIT = { limit: 20, windowMs: 60_000 } as const;

export type AdmsGuard = {
  /**
   * Run first in every /iclock request. Returns the response to send when the
   * request must be turned away with 429, or null to carry on. `serial` is the
   * well-formed serial number the request announced, if any.
   */
  check(request: Request, serial: string | null): Response | null;
  /** Call when a request was refused as unknown. Too many from one address are then turned away early. */
  noteRefused(request: Request): void;
};

function tooMany(retryAfterSeconds: number): Response {
  return new Response("ERROR: too many requests\n", {
    status: 429,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds) },
  });
}

export function createAdmsGuard(options: { now?: () => number } = {}): AdmsGuard {
  const perDevice = createRateLimiter({ ...DEVICE_LIMIT, now: options.now });
  const refused = createRateLimiter({ ...REFUSED_LIMIT, now: options.now });

  return {
    check(request, serial) {
      const ip = clientIp(request);

      // An address that keeps asking with serial numbers we do not know is turned away before any lookup.
      const blocked = refused.peek(ip);
      if (!blocked.allowed) return tooMany(blocked.retryAfterSeconds);

      const decision = perDevice.hit(`${serial ?? "none"}|${ip}`);
      return decision.allowed ? null : tooMany(decision.retryAfterSeconds);
    },
    noteRefused(request) {
      refused.hit(clientIp(request));
    },
  };
}

// One guard for the whole process, kept across reloads in development.
const globalForGuard = globalThis as unknown as { admsGuard?: AdmsGuard };
export const admsGuard: AdmsGuard = (globalForGuard.admsGuard ??= createAdmsGuard());
