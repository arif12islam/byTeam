import { and, count, desc, eq, gte, isNull, lt, type SQL } from "drizzle-orm";

import type { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { isValidOfficeDate, nextDate, officeDateTimeToInstant } from "@/lib/time";

type Db = ReturnType<typeof getDb>;
type Reader = Pick<Db, "select" | "selectDistinct">;

export const AUDIT_PAGE_SIZE = 50;

/** Plain words for the actions the app writes. An action not listed here is made readable from its code. */
const ACTION_LABELS: Record<string, string> = {
  "attendance.adjust": "Corrected attendance",
  "device.create": "Added a device",
  "device.update": "Changed a device",
  "device.send_employees": "Sent employees to a device",
  "employee.create": "Added an employee",
  "employee.update": "Changed an employee",
  "holiday.create": "Added a holiday",
  "holiday.delete": "Removed a holiday",
  "leave.create": "Recorded leave",
  "leave.approve": "Approved leave",
  "leave.reject": "Rejected leave",
  "leave.cancel": "Cancelled leave",
  "leave_type.create": "Added a leave type",
  "leave_type.update": "Changed a leave type",
  "outage.create": "Recorded an office outage",
  "outage.delete": "Removed an office outage",
  "payroll_adjustment.create": "Added a bonus or advance",
  "payroll_adjustment.delete": "Removed a bonus or advance",
  "payroll_run.create": "Started a payroll draft",
  "payroll_run.recompute": "Recomputed payroll",
  "payroll_run.finalize": "Finalized payroll",
  "payroll_run.unlock": "Unlocked payroll",
  "rule_set.create": "Added pay rules",
  "rule_set.update": "Changed pay rules",
  "salary.create": "Set a salary",
  "salary.update": "Changed a salary",
  "settings.create": "Saved company settings",
  "settings.update": "Changed company settings",
  "shift.create": "Added a shift",
  "shift.update": "Changed a shift",
  "user.create": "Added a user",
};

/** "payroll_run.finalize" as "Finalized payroll"; an unknown code like "employee.deactivate" as "Employee deactivate". */
export function describeAuditAction(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const words = action.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type FieldChange = { field: string; before: string | null; after: string | null };

/** A value as short text for a table cell. Null and a missing value are both shown as nothing. */
function show(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * What an entry changed, field by field. For a creation every field of the new
 * record is listed with nothing before it, for a deletion every field of the
 * old record, and for an update only the fields whose value differs. Pure.
 */
export function changedFields(before: unknown, after: unknown): FieldChange[] {
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};

  const fields = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const was = show(b[field]);
    const now = show(a[field]);
    if (was !== now) changes.push({ field, before: was, after: now });
  }
  return changes;
}

export type AuditFilters = {
  /** A user id, or "system" for entries with no person (scripts). */
  actor?: string;
  /** An exact action code like "payroll_run.finalize". */
  action?: string;
  /** The kind of record, like "employee". */
  entity?: string;
  /** The id of one record, to see its whole history. */
  record?: string;
  /** Office dates, YYYY-MM-DD, both included. */
  from?: string;
  to?: string;
};

export type AuditEntry = {
  id: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
};

function buildWhere(filters: AuditFilters): SQL | undefined {
  const where: SQL[] = [];
  if (filters.actor === "system") where.push(isNull(auditLog.actorId));
  else if (filters.actor) where.push(eq(auditLog.actorId, filters.actor));
  if (filters.action) where.push(eq(auditLog.action, filters.action));
  if (filters.entity) where.push(eq(auditLog.entity, filters.entity));
  if (filters.record) where.push(eq(auditLog.entityId, filters.record));
  if (filters.from && isValidOfficeDate(filters.from)) {
    const start = officeDateTimeToInstant(filters.from, "00:00");
    if (start) where.push(gte(auditLog.createdAt, start));
  }
  if (filters.to && isValidOfficeDate(filters.to)) {
    const end = officeDateTimeToInstant(nextDate(filters.to), "00:00");
    if (end) where.push(lt(auditLog.createdAt, end));
  }
  return where.length > 0 ? and(...where) : undefined;
}

/** One page of entries, newest first, with how many match in all. Page numbers start at 1 and are kept within range. */
export async function listAuditEntries(db: Reader, filters: AuditFilters, page = 1): Promise<{ entries: AuditEntry[]; total: number; page: number; pages: number }> {
  const where = buildWhere(filters);

  const [{ total }] = await db.select({ total: count() }).from(auditLog).where(where);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);

  const entries = await db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      actorId: auditLog.actorId,
      actorName: users.name,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(where)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((current - 1) * AUDIT_PAGE_SIZE);

  return { entries, total, page: current, pages };
}

export type AuditFilterOptions = {
  actors: { id: string; name: string }[];
  actions: string[];
  entities: string[];
  /** True when some entries were written with no person (scripts), so "System" is worth offering. */
  hasSystem: boolean;
};

/** What the filter boxes offer: only people, actions and kinds of record that really appear in the log. */
export async function loadAuditFilterOptions(db: Reader): Promise<AuditFilterOptions> {
  const [actors, actions, entities, [system]] = await Promise.all([
    db.selectDistinct({ id: users.id, name: users.name }).from(auditLog).innerJoin(users, eq(users.id, auditLog.actorId)).orderBy(users.name),
    db.selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(auditLog.action),
    db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(auditLog.entity),
    db.select({ n: count() }).from(auditLog).where(isNull(auditLog.actorId)),
  ]);
  return { actors, actions: actions.map((a) => a.action), entities: entities.map((e) => e.entity), hasSystem: system.n > 0 };
}
