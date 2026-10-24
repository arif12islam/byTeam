/**
 * All business dates in byTeam are calendar dates in the office time zone.
 * A punch at 00:30 Dhaka time belongs to that Dhaka date, even though it is
 * the previous day in UTC.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Dhaka";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) of an instant in the office time zone. */
export function toOfficeDate(instant: Date): string {
  return dateFormatter.format(instant);
}

/** The office date before the given one, as YYYY-MM-DD. */
export function previousDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d - 1));
  return utc.toISOString().slice(0, 10);
}

/** Number of days in a month, where month is "YYYY-MM". */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidOfficeDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < 1900) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Day of the week for a YYYY-MM-DD date: 0 is Sunday, 6 is Saturday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const displayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** A YYYY-MM-DD date for people to read, like "Fri 21 Feb 2026". */
export function formatOfficeDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const parts = Object.fromEntries(
    displayFormatter.formatToParts(new Date(Date.UTC(y, m - 1, d))).map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

/** True for a real month written as YYYY-MM. */
export function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1900;
}

/** The office month (YYYY-MM) an instant falls in. */
export function toOfficeMonth(instant: Date): string {
  return toOfficeDate(instant).slice(0, 7);
}

/** A YYYY-MM month for people to read, like "Jan 2026". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  return `${name} ${y}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** An instant in office time for people to read, like "24 Oct 2026, 09:15". */
export function formatOfficeDateTime(instant: Date): string {
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}
