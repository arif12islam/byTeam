import { and, asc, gte, lte } from "drizzle-orm";

import type { getDb } from "@/db";
import { payrollRuns } from "@/db/schema";
import { formatMonth } from "@/lib/time";

type Db = ReturnType<typeof getDb>;
type Reader = Pick<Db, "select">;

/**
 * The months (YYYY-MM) between two office dates whose payroll is finalized.
 * Attendance, leave and the month's bonuses and advances are locked for those
 * months until the owner unlocks them.
 *
 * Pass `lock: true` inside a transaction that is about to change data for the
 * range. It takes a shared lock on the range's payroll runs, so finalizing
 * (which needs an exclusive lock) waits until the change is saved, and a change
 * that starts after finalizing sees the month as locked.
 */
export async function finalizedMonthsBetween(reader: Reader, from: string, to: string, options: { lock?: boolean } = {}): Promise<Set<string>> {
  const query = reader
    .select({ month: payrollRuns.month, status: payrollRuns.status })
    .from(payrollRuns)
    .where(and(gte(payrollRuns.month, `${from.slice(0, 7)}-01`), lte(payrollRuns.month, `${to.slice(0, 7)}-01`)))
    .orderBy(asc(payrollRuns.month));
  const rows = await (options.lock ? query.for("share") : query);
  return new Set(rows.filter((r) => r.status === "finalized").map((r) => r.month.slice(0, 7)));
}

/** True when the date falls in one of the locked months. */
export function isLockedDate(date: string, lockedMonths: ReadonlySet<string>): boolean {
  return lockedMonths.has(date.slice(0, 7));
}

/** The message for a refused change, naming the locked months. `what` finishes the sentence, like "leave in that time". */
export function lockedMessage(lockedMonths: ReadonlySet<string>, what: string): string {
  const names = [...lockedMonths].sort().map(formatMonth);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Payroll for ${list} is finalized, so ${what} cannot be changed. Ask the owner to unlock ${names.length === 1 ? "the month" : "those months"} first.`;
}
