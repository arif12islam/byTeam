import { and, asc, eq, gte, lt, or, sql } from "drizzle-orm";

import type { getDb } from "@/db";
import { deviceCommands } from "@/db/schema";
import { MAX_ATTEMPTS, RESEND_AFTER_SECONDS, type CommandResult } from "@/lib/adms/commands";

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
