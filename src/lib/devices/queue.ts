import { and, asc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";

import type { getDb } from "@/db";
import { deviceCommands, devices, employees } from "@/db/schema";
import {
  buildUserUpdateCommand,
  MAX_ATTEMPTS,
  RESEND_AFTER_SECONDS,
  type CommandResult,
} from "@/lib/adms/commands";
import { audit } from "@/lib/audit";

type Db = ReturnType<typeof getDb>;

/**
 * The next command for a device, marked as sent. Oldest first. A command that
 * was sent but never confirmed is offered again after RESEND_AFTER_SECONDS, and
 * is marked failed once it has been sent MAX_ATTEMPTS times. Two polls at once
 * never get the same command: the row is locked while it is claimed.
 */
export async function claimNextCommand(db: Db, serialNo: string, now: Date): Promise<{ id: number; command: string } | null> {
  const staleBefore = new Date(now.getTime() - RESEND_AFTER_SECONDS * 1000);

  return db.transaction(async (tx) => {
    await tx
      .update(deviceCommands)
      .set({ status: "failed", result: "No reply from the device after several tries.", completedAt: now })
      .where(
        and(
          eq(deviceCommands.deviceSn, serialNo),
          eq(deviceCommands.status, "sent"),
          lt(deviceCommands.sentAt, staleBefore),
          gte(deviceCommands.attempts, MAX_ATTEMPTS),
        ),
      );

    const [next] = await tx
      .select({ id: deviceCommands.id, command: deviceCommands.command })
      .from(deviceCommands)
      .where(
        and(
          eq(deviceCommands.deviceSn, serialNo),
          or(
            eq(deviceCommands.status, "pending"),
            and(eq(deviceCommands.status, "sent"), lt(deviceCommands.sentAt, staleBefore)),
          ),
        ),
      )
      .orderBy(asc(deviceCommands.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;

    await tx
      .update(deviceCommands)
      .set({ status: "sent", sentAt: now, attempts: sql`${deviceCommands.attempts} + 1` })
      .where(eq(deviceCommands.id, next.id));
    return next;
  });
}

/**
 * Records what the device reported for a command it was sent: done when the
 * return code is 0 or more, failed when it is negative. A device can only
 * report on its own commands, and only on ones still waiting for a reply, so a
 * repeated report changes nothing. Returns whether a command was updated.
 */
export async function completeCommand(db: Db, serialNo: string, result: CommandResult, now: Date): Promise<boolean> {
  const rows = await db
    .update(deviceCommands)
    .set({
      status: result.returnCode >= 0 ? "done" : "failed",
      result: `Return=${result.returnCode}`,
      completedAt: now,
    })
    .where(
      and(
        eq(deviceCommands.id, result.id),
        eq(deviceCommands.deviceSn, serialNo),
        eq(deviceCommands.status, "sent"),
      ),
    )
    .returning({ id: deviceCommands.id });
  return rows.length > 0;
}

/** The db client or a transaction. */
type Writer = Pick<Db, "select" | "insert">;

/**
 * Queues one command for each of the given devices, skipping a device that
 * already has the identical command waiting, so saving twice in a row does not
 * pile up copies. Returns how many commands were added.
 */
async function queueForDevices(writer: Writer, serials: string[], commands: string[]): Promise<number> {
  if (serials.length === 0 || commands.length === 0) return 0;

  const waiting = await writer
    .select({ deviceSn: deviceCommands.deviceSn, command: deviceCommands.command })
    .from(deviceCommands)
    .where(and(inArray(deviceCommands.deviceSn, serials), eq(deviceCommands.status, "pending")));
  const alreadyWaiting = new Set(waiting.map((w) => `${w.deviceSn}\u0000${w.command}`));

  const rows = serials.flatMap((deviceSn) =>
    commands.filter((command) => !alreadyWaiting.has(`${deviceSn}\u0000${command}`)).map((command) => ({ deviceSn, command })),
  );
  if (rows.length === 0) return 0;
  await writer.insert(deviceCommands).values(rows);
  return rows.length;
}

async function activeSerials(writer: Writer): Promise<string[]> {
  const rows = await writer.select({ serialNo: devices.serialNo }).from(devices).where(eq(devices.active, true));
  return rows.map((r) => r.serialNo);
}

/**
 * Sends a person to every active device, so the PIN on the device is their
 * employee code. Call it inside the transaction that saves the employee.
 */
export async function queueUserUpdate(writer: Writer, user: { empCode: string; name: string }): Promise<number> {
  return queueForDevices(writer, await activeSerials(writer), [buildUserUpdateCommand(user)]);
}

/**
 * Sends every active employee to one device. For a device added after the
 * employees were. Returns how many commands were queued.
 */
export async function queueAllUsers(db: Db, serialNo: string, actorId: string): Promise<{ queued: number; employees: number } | null> {
  return db.transaction(async (tx) => {
    const [device] = await tx.select().from(devices).where(and(eq(devices.serialNo, serialNo), eq(devices.active, true)));
    if (!device) return null;

    const people = await tx
      .select({ empCode: employees.empCode, name: employees.name })
      .from(employees)
      .where(eq(employees.active, true))
      .orderBy(asc(employees.empCode));
    const queued = await queueForDevices(tx, [serialNo], people.map(buildUserUpdateCommand));

    await audit(tx, {
      actorId,
      action: "device.send_employees",
      entity: "device",
      entityId: device.id,
      after: { serialNo, employees: people.length, queued },
    });
    return { queued, employees: people.length };
  });
}
