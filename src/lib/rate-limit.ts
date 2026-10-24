/**
 * A small in-memory rate limiter, shared by the device routes and the sign-in
 * form. The counts live in the memory of the running server: no outside service
 * is needed, so it works with `next start` on one machine. On a host that runs
 * several copies of the server each copy counts for itself, which still stops a
 * flood aimed at any one of them.
 */

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  /** Counts one request for the key and says whether it is within the limit. */
  hit(key: string): RateDecision;
  /** Says whether the key is over the limit without counting a request. */
  peek(key: string): RateDecision;
  /** Forgets the key, for example after a successful sign in. */
  reset(key: string): void;
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
    reset: (key) => void windows.delete(key),
    size: () => windows.size,
  };
}

/** The address a request came from, as the host in front of us reports it in these headers. */
export function ipFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim();
  // Anything that is not a plausible address shares one bucket instead of making new ones.
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : "unknown";
}

/** The address the request came from. */
export function clientIp(request: Request): string {
  return ipFromHeaders(request.headers);
}
