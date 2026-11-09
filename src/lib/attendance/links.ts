/**
 * Where to send someone to look at one person's attendance. Pure, so Insights
 * and the screens agree on the addresses.
 */

/** One person's whole month as a calendar. */
export function personMonthHref(employeeId: string, month: string): string {
  return `/attendance/${employeeId}?month=${month}`;
}

/** One person's day, with the punches behind it. Back goes to their calendar. */
export function personDayHref(employeeId: string, date: string): string {
  return `/attendance/${employeeId}/${date}?from=person`;
}
