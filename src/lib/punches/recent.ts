import { desc } from "drizzle-orm";

import type { getDb } from "@/db";
import { rawPunches } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

export type ReceivedLine = { deviceSn: string; rawLine: string; receivedAt: Date };

/** The newest `perDevice` lines for each device, newest first. Rows must come in newest first. */
export function latestPerDevice(rows: readonly ReceivedLine[], perDevice: number): Map<string, ReceivedLine[]> {
  const byDevice = new Map<string, ReceivedLine[]>();
  for (const row of rows) {
    const list = byDevice.get(row.deviceSn) ?? [];
    if (list.length < perDevice) list.push(row);
    byDevice.set(row.deviceSn, list);
  }
  return byDevice;
}

/**
 * The last punch lines each device sent, exactly as received, for comparing
 * the real device's format with the simulator. Reads only the newest rows, so
 * a device that has been quiet for a long time may show nothing.
 */
export async function listRecentLines(db: Db, perDevice = 5): Promise<Map<string, ReceivedLine[]>> {
  const rows = await db
    .select({ deviceSn: rawPunches.deviceSn, rawLine: rawPunches.rawLine, receivedAt: rawPunches.receivedAt })
    .from(rawPunches)
    .orderBy(desc(rawPunches.id))
    .limit(200);
  return latestPerDevice(rows, perDevice);
}
