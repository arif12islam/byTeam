/**
 * Quiet polling: the device asks for commands every 30 seconds, and on a
 * database that sleeps when idle (Neon's free plan sleeps after 5 minutes and
 * allows about 100 compute hours a month) asking the database every time would
 * keep it awake all month and use up the allowance by the middle of it.
 *
 * So a poll is answered from memory for a while after the database was last
 * asked: the device is known to be registered and there was nothing to send.
 * The database is asked again once the quiet window has passed, which also
 * records the device as seen. Uploads (punches) always go to the database.
 *
 * The cost: a command queued from another server instance reaches the device
 * up to one window later, and "last seen" moves in steps of one window, so a
 * device counts as offline only after two windows with nothing heard.
 *
 * ADMS_QUIET_MINUTES sets the window. 20 by default; 0 turns quiet polling off,
 * which suits a server whose database never sleeps, like the planned VPS.
 */

export const DEFAULT_QUIET_MINUTES = 20;
const MAX_QUIET_MINUTES = 60;

/** The quiet window in minutes, from ADMS_QUIET_MINUTES. Anything not a whole number from 0 up gets the default. */
export function quietMinutes(value: string | undefined = process.env.ADMS_QUIET_MINUTES): number {
  if (value === undefined || value.trim() === "") return DEFAULT_QUIET_MINUTES;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 0) return DEFAULT_QUIET_MINUTES;
  return Math.min(minutes, MAX_QUIET_MINUTES);
}

/** How long without a word before a device counts as offline: two quiet windows and a margin, or 15 minutes without quiet polling. */
export function offlineAfterMinutes(quiet: number = quietMinutes()): number {
  return quiet > 0 ? quiet * 2 + 5 : 15;
}

export type KnownDevice = { id: string; serialNo: string };

export type PollMemo = {
  /**
   * What the database said about this serial number within the window: the
   * device when it is accepted and had nothing waiting, null when it was
   * refused, undefined when the database must be asked.
   */
  recall(serial: string, now: Date): KnownDevice | null | undefined;
  /** Note what the database just said. */
  remember(serial: string, device: KnownDevice | null, now: Date): void;
  /** Ask the database on the next poll: for one device, or for all of them. */
  forget(serial?: string): void;
};

/** Older entries are dropped once there are this many, so made-up serial numbers cannot grow memory. */
const MAX_ENTRIES = 1_000;

export function createPollMemo(windowMs: number): PollMemo {
  const entries = new Map<string, { device: KnownDevice | null; at: number }>();
  return {
    recall(serial, now) {
      if (windowMs <= 0) return undefined;
      const entry = entries.get(serial);
      if (!entry) return undefined;
      const age = now.getTime() - entry.at;
      // A clock that went backwards counts as expired, so nothing is remembered forever.
      if (age < 0 || age >= windowMs) {
        entries.delete(serial);
        return undefined;
      }
      return entry.device;
    },
    remember(serial, device, now) {
      if (windowMs <= 0) return;
      entries.delete(serial);
      if (entries.size >= MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(serial, { device, at: now.getTime() });
    },
    forget(serial) {
      if (serial === undefined) entries.clear();
      else entries.delete(serial);
    },
  };
}

/** One per server instance, like the rate limiter. */
export const pollMemo = createPollMemo(quietMinutes() * 60_000);
