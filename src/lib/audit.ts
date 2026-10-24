import { auditLog } from "@/db/schema";
import type { getDb } from "@/db";

type Db = ReturnType<typeof getDb>;

/** Anything that can insert: the db client or a transaction. */
export type AuditWriter = Pick<Db, "insert">;

export type AuditEntry = {
  /** Signed-in user id, or null for scripts such as the owner seed. */
  actorId: string | null;
  /** "<entity>.<verb>", for example "employee.create" or "shift.update". */
  action: string;
  /** The kind of record, for example "employee". */
  entity: string;
  /** Primary key of the record, as text. */
  entityId: string;
  /** The record before the change. Leave out on create. */
  before?: unknown;
  /** The record after the change. Leave out on delete. */
  after?: unknown;
};

const SECRET_KEYS = /password|secret|token/i;

/**
 * Makes a value safe to store as JSON: dates become ISO strings, undefined
 * keys are dropped, and anything that looks like a secret is replaced so a
 * hash never lands in the audit log.
 */
export function toAuditJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toAuditJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      out[key] = SECRET_KEYS.test(key) ? "[redacted]" : toAuditJson(item);
    }
    return out;
  }
  return value;
}

/**
 * Writes one audit_log row. Pass the same transaction as the change itself,
 * so the change and its audit row are saved together or not at all:
 *
 *   await db.transaction(async (tx) => {
 *     const [row] = await tx.insert(shifts).values(input).returning();
 *     await audit(tx, { actorId, action: "shift.create", entity: "shift", entityId: row.id, after: row });
 *   });
 */
export async function audit(writer: AuditWriter, entry: AuditEntry): Promise<void> {
  await writer.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before === undefined ? null : toAuditJson(entry.before),
    after: entry.after === undefined ? null : toAuditJson(entry.after),
  });
}
