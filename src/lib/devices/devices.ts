import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { devices } from "@/db/schema";
import { offlineAfterMinutes, pollMemo } from "@/lib/adms/quiet-poll";
import { audit } from "@/lib/audit";

type Db = ReturnType<typeof getDb>;

/**
 * A device that has not been heard from for longer than this counts as
 * offline: 45 minutes with the default quiet polling, 15 without it.
 */
export const OFFLINE_AFTER_MINUTES = offlineAfterMinutes();

export type DeviceStatus = "online" | "offline" | "never";

/** Online up to and including `offlineAfter` minutes after the last contact. */
export function deviceStatus(lastSeenAt: Date | null, now: Date, offlineAfter: number = OFFLINE_AFTER_MINUTES): DeviceStatus {
  if (lastSeenAt === null) return "never";
  const minutes = (now.getTime() - lastSeenAt.getTime()) / 60_000;
  return minutes <= offlineAfter ? "online" : "offline";
}

/** "Just now", "5 min ago", "3 h ago", "2 days ago". Null when it has never connected. */
export function describeAge(lastSeenAt: Date | null, now: Date): string | null {
  if (lastSeenAt === null) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - lastSeenAt.getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** Serial numbers differ by model, so only the shape is checked: no spaces, a sensible length. */
export const SERIAL_PATTERN = /^[A-Za-z0-9._-]{4,64}$/;

export const newDeviceSchema = z.object({
  serialNo: z
    .string()
    .trim()
    .regex(SERIAL_PATTERN, "Enter the serial number exactly as shown on the device, with no spaces."),
  name: z.string().trim().min(1, "Enter a name, like Front door.").max(80, "Use 80 characters or fewer."),
});

export const deviceNameSchema = newDeviceSchema.pick({ name: true });

export type NewDevice = z.input<typeof newDeviceSchema>;

export type DeviceRow = {
  id: string;
  serialNo: string;
  name: string;
  lastSeenAt: Date | null;
  /** Estimated device clock minus server clock, in seconds. Null until checked. */
  clockOffsetSeconds: number | null;
  clockCheckedAt: Date | null;
  active: boolean;
};

export async function listDevices(db: Db): Promise<DeviceRow[]> {
  return db
    .select({
      id: devices.id,
      serialNo: devices.serialNo,
      name: devices.name,
      lastSeenAt: devices.lastSeenAt,
      clockOffsetSeconds: devices.clockOffsetSeconds,
      clockCheckedAt: devices.clockCheckedAt,
      active: devices.active,
    })
    .from(devices)
    .orderBy(asc(devices.name), asc(devices.serialNo));
}

/** Throws a unique violation when the serial number is already registered. */
export async function addDevice(db: Db, input: NewDevice, actorId: string) {
  const data = newDeviceSchema.parse(input);

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(devices).values(data).returning();
    await audit(tx, { actorId, action: "device.create", entity: "device", entityId: row.id, after: row });
    return row;
  });
}

/** Returns null when the device is gone. Saving the same name writes nothing. */
export async function renameDevice(db: Db, id: string, name: string, actorId: string) {
  const data = deviceNameSchema.parse({ name });

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(devices).where(eq(devices.id, id));
    if (!before) return null;
    if (before.name === data.name) return { changed: false };

    const [after] = await tx.update(devices).set(data).where(eq(devices.id, id)).returning();
    await audit(tx, { actorId, action: "device.update", entity: "device", entityId: id, before, after });
    return { changed: true };
  });
}

/** An inactive device is rejected on the /iclock routes. Nothing it sent before is removed. */
export async function setDeviceActive(db: Db, id: string, active: boolean, actorId: string) {
  const result = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(devices).where(eq(devices.id, id));
    if (!before) return null;
    if (before.active === active) return { changed: false };

    const [after] = await tx.update(devices).set({ active }).where(eq(devices.id, id)).returning();
    await audit(tx, {
      actorId,
      action: active ? "device.activate" : "device.deactivate",
      entity: "device",
      entityId: id,
      before,
      after,
    });
    return { changed: true };
  });
  // Polls answered from memory on this server would otherwise keep the old answer for a while.
  if (result?.changed) pollMemo.forget();
  return result;
}
