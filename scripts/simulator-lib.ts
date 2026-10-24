/**
 * Building blocks for the device simulator: what a ZKTeco device would send.
 * No network and no database here, so the output can be tested against the
 * real parser.
 */

/** The device clock reading for an instant, "2026-10-24 09:00:00", in the office time zone. */
export function deviceTime(instant: Date, timeZone = "Asia/Dhaka"): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export type SimPunch = { code: string; at: Date; status?: number; verify?: number };

/** One ATTLOG line: PIN, time, status, verify, work code, two reserved fields, tab separated. */
export function attlogLine(p: SimPunch): string {
  return [p.code, deviceTime(p.at), p.status ?? 0, p.verify ?? 15, 0, 0, 0].join("\t");
}

/** An upload body: Windows line endings, as a device sends, with a trailing break. */
export function attlogBody(punches: SimPunch[]): string {
  return punches.map(attlogLine).join("\r\n") + "\r\n";
}

/** The key a punch is stored under, so the simulator can count what should be stored. */
export function punchKey(p: SimPunch): string {
  return `${p.code}|${deviceTime(p.at)}`;
}

/**
 * A working day for each code: a check in around 09:00 and a check out around
 * 18:00 on the given Dhaka date, with a few minutes of spread so no two codes
 * punch at the same second.
 */
export function workDay(codes: string[], dhakaDate: string): SimPunch[] {
  const punches: SimPunch[] = [];
  codes.forEach((code, i) => {
    const inAt = new Date(`${dhakaDate}T09:00:00+06:00`);
    inAt.setSeconds(i * 47 + 5);
    inAt.setMinutes(inAt.getMinutes() + (i * 7) % 25);
    const outAt = new Date(`${dhakaDate}T18:00:00+06:00`);
    outAt.setSeconds(i * 31 + 3);
    outAt.setMinutes(outAt.getMinutes() + (i * 5) % 20);
    punches.push({ code, at: inAt, status: 0 }, { code, at: outAt, status: 1 });
  });
  return punches.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Distinct punches, by key. */
export function uniquePunches(punches: SimPunch[]): SimPunch[] {
  const seen = new Map<string, SimPunch>();
  for (const p of punches) seen.set(punchKey(p), p);
  return [...seen.values()];
}

/** A command line from a poll reply, "C:12:DATA UPDATE ...", as its id and text. Null for anything else. */
export function readCommandReply(reply: string): { id: number; command: string } | null {
  const match = /^C:(\d+):([\s\S]+)$/.exec(reply.trim());
  return match ? { id: Number(match[1]), command: match[2] } : null;
}
