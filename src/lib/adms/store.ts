import type { getDb } from "@/db";
import { rawPunches } from "@/db/schema";

import type { StandardPunch } from "./zkteco-adapter";

type Db = ReturnType<typeof getDb>;

/** Rows per INSERT. Eight columns each keeps a statement far below Postgres' parameter limit. */
const BATCH_SIZE = 500;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Saves punches to the append-only log. The unique key on device, employee
 * code and time does the deduplication: a punch we already hold, including a
 * whole resent batch, is skipped without error. Returns how many were new and
 * which, so the days they fall on can be recomputed.
 */
export async function savePunches(
  db: Db,
  punches: StandardPunch[],
): Promise<{ received: number; inserted: number; newPunches: { empCode: string; punchedAt: Date }[] }> {
  const newPunches: { empCode: string; punchedAt: Date }[] = [];

  for (const batch of chunk(punches, BATCH_SIZE)) {
    const rows = await db
      .insert(rawPunches)
      .values(
        batch.map((p) => ({
          deviceSn: p.deviceSn,
          empCode: p.empCode,
          punchedAt: p.punchedAt,
          statusCode: p.statusCode,
          verifyCode: p.verifyCode,
          rawLine: p.rawLine,
        })),
      )
      .onConflictDoNothing()
      .returning({ empCode: rawPunches.empCode, punchedAt: rawPunches.punchedAt });
    newPunches.push(...rows);
  }

  return { received: punches.length, inserted: newPunches.length, newPunches };
}
