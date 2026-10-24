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
