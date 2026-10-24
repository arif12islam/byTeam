import { and, eq } from "drizzle-orm";

import type { getDb } from "@/db";
import { devices } from "@/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Called on every request from a device. In one statement it checks that the
 * serial number is registered and active, and records that the device was just
 * heard from. Returns null for an unknown or switched-off device, which the
 * caller must refuse.
 */
export async function touchDevice(db: Db, serialNo: string, now: Date): Promise<{ id: string; serialNo: string } | null> {
  const [row] = await db
    .update(devices)
    .set({ lastSeenAt: now })
    .where(and(eq(devices.serialNo, serialNo), eq(devices.active, true)))
    .returning({ id: devices.id, serialNo: devices.serialNo });
  return row ?? null;
}
