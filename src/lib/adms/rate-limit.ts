/**
 * Rate limits for the /iclock device routes, kept in the memory of the running
 * server. No outside service is needed, so it works with `next start` on one
 * machine. On a host that runs several copies of the server each copy counts
 * for itself, which still stops a flood aimed at any one of them.
 *
 * A real device sends a few requests a minute: a poll every 30 seconds and a
 * punch as it happens. The limits are many times that.
 */

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  /** Counts one request for the key and says whether it is within the limit. */
  hit(key: string): RateDecision;
  /** Says whether the key is over the limit without counting a request. */
  peek(key: string): RateDecision;
  /** How many keys are being tracked. */
  size(): number;
};

/** Never track more keys than this, so a flood of made-up addresses cannot fill the memory. */
const MAX_KEYS = 10_000;

/** A fixed window counter: up to `limit` requests per key in each `windowMs`. */
export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? Date.now;
  const windows = new Map<string, { count: number; resetAt: number }>();

  const retryAfter = (resetAt: number, at: number) => Math.max(1, Math.ceil((resetAt - at) / 1000));

  function prune(at: number) {
    for (const [key, w] of windows) if (w.resetAt <= at) windows.delete(key);
    // Still full: drop the oldest windows to make room for one more. Insertion order is oldest first.
    for (const key of windows.keys()) {
      if (windows.size < MAX_KEYS) break;
      windows.delete(key);
    }
  }

  return {
    hit(key) {
      const at = now();
      let w = windows.get(key);
      if (!w || w.resetAt <= at) {
        if (windows.size >= MAX_KEYS) prune(at);
        w = { count: 0, resetAt: at + windowMs };
        windows.set(key, w);
      }
      w.count += 1;
      return w.count <= limit ? { allowed: true } : { allowed: false, retryAfterSeconds: retryAfter(w.resetAt, at) };
    },
    peek(key) {
      const at = now();
      const w = windows.get(key);
      if (!w || w.resetAt <= at || w.count <= limit) return { allowed: true };
      return { allowed: false, retryAfterSeconds: retryAfter(w.resetAt, at) };
    },
    size: () => windows.size,
  };
}

/** The address the request came from, as the host in front of us reports it. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  // Anything that is not a plausible address shares one bucket instead of making new ones.
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "unknown";
}

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
