import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Slows down password guessing on the sign-in form. The form calls Better Auth
 * directly, which skips Better Auth's own limit on its web route, so we count
 * failed attempts ourselves, in the memory of the running server.
 *
 * - After 10 failed attempts for one email from one address, that pair is turned
 *   away for 15 minutes, even with the right password. Guessing cannot go on, and
 *   someone elsewhere is not locked out of the same account.
 * - After 30 failed attempts from one address across any emails, that address is
 *   turned away for 15 minutes, which stops one machine trying many accounts.
 * - A successful sign in clears the count for that email and address.
 */
export const MAX_FAILURES_PER_ACCOUNT = 10;
export const MAX_FAILURES_PER_ADDRESS = 30;
export const LOGIN_WINDOW_MS = 15 * 60_000;

export type LoginDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type LoginThrottle = {
  /** Ask before checking the password. */
  check(ip: string, email: string): LoginDecision;
  /** Record a wrong password (or any refused sign in). */
  failed(ip: string, email: string): void;
  /** Record a good sign in. */
  succeeded(ip: string, email: string): void;
};

/** Emails differ only by capital letters and spaces are the same account. Very long text is cut so it cannot make huge keys. */
function accountKey(ip: string, email: string): string {
  return `${ip}|${email.trim().toLowerCase().slice(0, 254)}`;
}

export function createLoginThrottle(options: { now?: () => number } = {}): LoginThrottle {
  // A limiter turns requests away once its count passes `limit`, so N failures allowed means a limit of N - 1 before the next is refused.
  const perAccount = createRateLimiter({ limit: MAX_FAILURES_PER_ACCOUNT - 1, windowMs: LOGIN_WINDOW_MS, now: options.now });
  const perAddress = createRateLimiter({ limit: MAX_FAILURES_PER_ADDRESS - 1, windowMs: LOGIN_WINDOW_MS, now: options.now });

  return {
    check(ip, email) {
      const account = perAccount.peek(accountKey(ip, email));
      const address = perAddress.peek(ip);
      if (account.allowed && address.allowed) return { allowed: true };
      const waits = [account, address].map((d) => (d.allowed ? 0 : d.retryAfterSeconds));
      return { allowed: false, retryAfterSeconds: Math.max(...waits) };
    },
    failed(ip, email) {
      perAccount.hit(accountKey(ip, email));
      perAddress.hit(ip);
    },
    succeeded(ip, email) {
      perAccount.reset(accountKey(ip, email));
    },
  };
}

/** The wording shown on the form when a sign in is turned away. */
export function describeThrottle(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many sign in attempts. Wait ${minutes} ${minutes === 1 ? "minute" : "minutes"} and try again.`;
}

// One throttle for the whole process, kept across reloads in development.
const globalForThrottle = globalThis as unknown as { loginThrottle?: LoginThrottle };
export const loginThrottle: LoginThrottle = (globalForThrottle.loginThrottle ??= createLoginThrottle());
