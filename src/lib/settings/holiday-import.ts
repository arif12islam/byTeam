import { z } from "zod";

import type { getDb } from "@/db";
import { addHoliday, holidaySchema, listHolidays } from "@/lib/settings/holidays";
import { eachDate, isValidOfficeDate, nextDate, previousDate, weekdayOf } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

/**
 * Bringing in a year of public holidays at once, from Google's public calendar
 * for Bangladesh or from a list pasted in. Nothing is saved until the person has
 * seen the list and ticked what they want, because the calendar is a guide, not
 * the government's gazette: Eid and other moon dates move, and it lists
 * observances that are not days off.
 */

/** Google's public holiday calendar for Bangladesh, as an iCalendar file. */
export const GOOGLE_FEED_URL = "https://calendar.google.com/calendar/ical/en.bd%23holiday%40group.v.calendar.google.com/public/basic.ics";

export type FeedKind = "holiday" | "observance";
export type FeedEvent = { date: string; name: string; kind: FeedKind };

const pad = (n: number) => String(n).padStart(2, "0");

/** iCalendar escapes commas, semicolons, backslashes and line breaks with a backslash. */
function unescapeText(value: string): string {
  return value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** A calendar date value like "20261216" or "20261216T000000Z" as YYYY-MM-DD, or null. */
function icsDate(value: string | undefined): string | null {
  const match = /(\d{4})(\d{2})(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  return isValidOfficeDate(date) ? date : null;
}

/**
 * The events in an iCalendar file. A day-long event is one date; a run of days
 * (its end date is the day after the last one) becomes one event per day.
 * "Public holiday" is what Google calls a day off; everything else is an observance.
 */
export function parseIcs(text: string): FeedEvent[] {
  // Long lines are folded: a line that starts with a space continues the one before.
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: FeedEvent[] = [];
  let current: { start?: string; end?: string; name?: string; description?: string } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") {
      if (current?.start && current.name) {
        const kind: FeedKind = /^public holiday/i.test(current.description ?? "") ? "holiday" : "observance";
        // The end date is exclusive: the day after the last day. Cap a run at two weeks so a bad file cannot flood the list.
        const endExclusive = current.end && current.end > current.start ? current.end : nextDate(current.start);
        for (const date of eachDate(current.start, previousDate(endExclusive)).slice(0, 14)) events.push({ date, name: current.name, kind });
      }
      current = null;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const key = line.slice(0, colon).split(";")[0].toUpperCase();
      const value = line.slice(colon + 1);
      if (key === "DTSTART") current.start = icsDate(value) ?? undefined;
      else if (key === "DTEND") current.end = icsDate(value) ?? undefined;
      else if (key === "SUMMARY") current.name = unescapeText(value);
      else if (key === "DESCRIPTION") current.description = unescapeText(value);
    }
  }
  return events;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthNumber(word: string): number | null {
  const index = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return index === -1 ? null : index + 1;
}

/** The date at the start of a pasted line and what is left of the line, or null when there is no date. */
function leadingDate(line: string): { date: string; rest: string } | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})\b\s*(.*)$/.exec(line);
  if (iso) return { date: `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`, rest: iso[4] };
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b\s*(.*)$/.exec(line);
  if (numeric) return { date: `${numeric[3]}-${pad(Number(numeric[2]))}-${pad(Number(numeric[1]))}`, rest: numeric[4] };
  const dayFirst = /^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{4})\b\s*(.*)$/.exec(line);
  if (dayFirst) {
    const month = monthNumber(dayFirst[2]);
    if (month) return { date: `${dayFirst[3]}-${pad(month)}-${pad(Number(dayFirst[1]))}`, rest: dayFirst[4] };
  }
  const monthFirst = /^(?:[A-Za-z]{3,9},?\s+)?([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b\s*(.*)$/.exec(line);
  if (monthFirst) {
    const month = monthNumber(monthFirst[1]);
    if (month) return { date: `${monthFirst[3]}-${pad(month)}-${pad(Number(monthFirst[2]))}`, rest: monthFirst[4] };
  }
  return null;
}

/**
 * A pasted list, one holiday a line: a date and a name, like
 * "2026-12-16 Victory Day", "16/12/2026, Victory Day" or "16 Dec 2026 - Victory Day".
 * Lines that cannot be read are returned so the person can fix them.
 */
export function parsePastedList(text: string): { events: FeedEvent[]; problems: string[] } {
  const events: FeedEvent[] = [];
  const problems: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const found = leadingDate(line);
    const name = found?.rest.replace(/^[\s,;:\-–]+/, "").trim() ?? "";
    if (!found || !isValidOfficeDate(found.date) || name === "") {
      problems.push(line);
      continue;
    }
    events.push({ date: found.date, name: name.slice(0, 120), kind: "holiday" });
  }
  return { events, problems };
}

export type Candidate = {
  date: string;
  name: string;
  kind: FeedKind;
  /** Another holiday is already on this date, so adding it would be refused. */
  alreadyAdded: boolean;
  /** The date is a weekly off day already, so a holiday adds nothing. */
  onWeeklyOff: boolean;
  /** The date is before today: adding it changes days that were already counted. */
  past: boolean;
  /** Whether it starts ticked. */
  selected: boolean;
};

/**
 * What to show for a year: one row per date (two events on one day become one
 * name), with working-day swaps left out. Days off start ticked; observances,
 * dates already added, weekly off days and dates before today start unticked.
 */
export function buildCandidates(
  events: readonly FeedEvent[],
  options: { year: number; existingDates: ReadonlySet<string>; weeklyOffDays: readonly number[]; today: string },
): Candidate[] {
  const byDate = new Map<string, { names: string[]; kind: FeedKind }>();
  for (const event of events) {
    if (!event.date.startsWith(`${options.year}-`)) continue;
    if (/^working day$/i.test(event.name.trim())) continue;
    const entry = byDate.get(event.date) ?? { names: [], kind: "observance" as FeedKind };
    if (!entry.names.includes(event.name)) entry.names.push(event.name);
    if (event.kind === "holiday") entry.kind = "holiday";
    byDate.set(event.date, entry);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { names, kind }]) => {
      const alreadyAdded = options.existingDates.has(date);
      const onWeeklyOff = options.weeklyOffDays.includes(weekdayOf(date));
      const past = date < options.today;
      return {
        date,
        name: names.join(" and ").slice(0, 120),
        kind,
        alreadyAdded,
        onWeeklyOff,
        past,
        selected: kind === "holiday" && !alreadyAdded && !onWeeklyOff && !past,
      };
    });
}

/** What the preview step hands back to the form: the list to tick from, or what went wrong. */
export type HolidayPreviewState = {
  error?: string;
  message?: string;
  candidates?: Candidate[];
  year?: number;
  /** Pasted lines that could not be read. */
  problems?: string[];
};

export type FeedResult = { ok: true; text: string } | { ok: false; error: string };

/** Fetches Google's calendar. Says in plain words when it cannot, so the person can paste a list instead. */
export async function fetchGoogleFeed(fetchImpl: typeof fetch = fetch): Promise<FeedResult> {
  const unavailable = "Could not reach Google's holiday calendar. Try again in a moment, or paste your own list instead.";
  try {
    const response = await fetchImpl(GOOGLE_FEED_URL, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "byTeam", Accept: "text/calendar" } });
    if (!response.ok) return { ok: false, error: unavailable };
    const text = await response.text();
    if (!text.includes("BEGIN:VCALENDAR")) return { ok: false, error: "Google's calendar did not answer as expected. Paste your own list instead." };
    return { ok: true, text };
  } catch {
    return { ok: false, error: unavailable };
  }
}

/** The most holidays one import adds. A year has about thirty. */
export const MAX_IMPORT = 60;

export const importItemSchema = holidaySchema;

export type ImportResult = { added: number; skipped: string[] };

/**
 * Adds the ticked holidays, each through the same path as adding one by hand:
 * an audit row each, and the day recomputed. A date that already has a holiday
 * is skipped, not an error. Finalized payroll months are not touched: days in
 * them stay as they were.
 */
export async function importHolidays(db: Db, items: readonly z.input<typeof holidaySchema>[], actorId: string): Promise<ImportResult> {
  const existing = new Set((await listHolidays(db)).map((h) => h.date));
  const result: ImportResult = { added: 0, skipped: [] };
  for (const item of items.slice(0, MAX_IMPORT)) {
    const parsed = holidaySchema.safeParse(item);
    if (!parsed.success) {
      result.skipped.push(String(item.date));
      continue;
    }
    if (existing.has(parsed.data.date)) {
      result.skipped.push(parsed.data.date);
      continue;
    }
    await addHoliday(db, parsed.data, actorId);
    existing.add(parsed.data.date);
    result.added += 1;
  }
  return result;
}
