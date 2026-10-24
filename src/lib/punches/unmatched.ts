import { desc, eq, max, min, notExists, sql } from "drizzle-orm";

import type { getDb } from "@/db";
import { employees, rawPunches } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

export type UnmatchedCode = {
  empCode: string;
  punches: number;
  firstPunchAt: Date;
  lastPunchAt: Date;
  /** Serial numbers of the devices the code was used on. */
  devices: string[];
};

/** How many codes to list. A busy device with a wrong setting could produce thousands. */
const LIMIT = 50;

/**
 * Employee codes that have punched but belong to nobody, most recent first.
 * Usually someone enrolled at the device who has not been added in the app yet.
 * The punches are kept: once an employee with that code exists they count.
 */
export async function listUnmatchedCodes(db: Db): Promise<UnmatchedCode[]> {
  const rows = await db
    .select({
      empCode: rawPunches.empCode,
      punches: sql<number>`count(*)::int`,
      firstPunchAt: min(rawPunches.punchedAt),
      lastPunchAt: max(rawPunches.punchedAt),
      devices: sql<string[]>`array_agg(distinct ${rawPunches.deviceSn})`,
    })
    .from(rawPunches)
    .where(notExists(db.select({ one: sql`1` }).from(employees).where(eq(employees.empCode, rawPunches.empCode))))
    .groupBy(rawPunches.empCode)
    .orderBy(desc(max(rawPunches.punchedAt)))
    .limit(LIMIT);

  return rows.map((r) => ({
    empCode: r.empCode,
    punches: r.punches,
    firstPunchAt: r.firstPunchAt!,
    lastPunchAt: r.lastPunchAt!,
    devices: r.devices,
  }));
}

/** A code worth offering as a starting value: digits only, like a real employee code. */
export function suggestedCode(value: string | string[] | undefined): string {
  return typeof value === "string" && /^\d{1,24}$/.test(value) ? value : "";
}
