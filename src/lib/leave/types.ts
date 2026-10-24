import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "@/db";
import { companySettings, leaveTypes, LEAVE_YEAR_BASES, type LeaveYearBasis } from "@/db/schema";
import { audit } from "@/lib/audit";

type Db = ReturnType<typeof getDb>;

/** A year has at most this many days, so a bigger quota is a typo. */
export const MAX_YEARLY_QUOTA = 366;

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(1, "Enter a leave type name, like Casual leave.").max(60, "Use 60 characters or fewer."),
  // A text field: empty means no limit, anything else must be whole days.
  yearlyQuota: z.preprocess(
    (v) => (v === undefined || v === null ? "" : typeof v === "number" ? String(v) : v),
    z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d+$/.test(v), "Enter the yearly days as a whole number, like 10, or leave it empty for no limit.")
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v === null || v <= MAX_YEARLY_QUOTA, `A year has at most ${MAX_YEARLY_QUOTA} days.`),
  ),
  isPaid: z.boolean(),
  active: z.boolean().default(true),
});

export type LeaveTypeInput = z.input<typeof leaveTypeSchema>;

export type LeaveTypeRow = {
  id: string;
  name: string;
  yearlyQuota: number | null;
  isPaid: boolean;
  active: boolean;
  /** Requests of any status that use this type. */
  requestCount: number;
};

/** Active types first, then by name. */
export async function listLeaveTypes(db: Db, options: { activeOnly?: boolean } = {}): Promise<LeaveTypeRow[]> {
  const rows = await db
    .select({
      id: leaveTypes.id,
      name: leaveTypes.name,
      yearlyQuota: leaveTypes.yearlyQuota,
      isPaid: leaveTypes.isPaid,
      active: leaveTypes.active,
      // Written out in full: Drizzle drops the table name from columns in a single-table query, and the
      // subquery would then compare the wrong "id".
      requestCount: sql<number>`(select count(*)::int from leave_requests lr where lr.leave_type_id = "leave_types"."id")`,
    })
    .from(leaveTypes)
    .where(options.activeOnly ? eq(leaveTypes.active, true) : undefined)
    .orderBy(sql`${leaveTypes.active} desc`, asc(leaveTypes.name));
  return rows;
}

/** Throws a unique violation when another type has the same name, whatever the capital letters. */
export async function createLeaveType(db: Db, input: LeaveTypeInput, actorId: string) {
  const data = leaveTypeSchema.parse(input);

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(leaveTypes).values(data).returning();
    await audit(tx, { actorId, action: "leave_type.create", entity: "leave_type", entityId: row.id, after: row });
    return row;
  });
}

/**
 * Returns null when the type no longer exists. Saving the same values writes
 * nothing. A new quota applies to balances straight away; requests already
 * approved are never changed by it.
 */
export async function updateLeaveType(db: Db, id: string, input: LeaveTypeInput, actorId: string) {
  const data = leaveTypeSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, id));
    if (!before) return null;

    const unchanged =
      before.name === data.name &&
      before.yearlyQuota === data.yearlyQuota &&
      before.isPaid === data.isPaid &&
      before.active === data.active;
    if (unchanged) return { leaveType: before, changed: false };

    const [after] = await tx.update(leaveTypes).set(data).where(eq(leaveTypes.id, id)).returning();
    await audit(tx, { actorId, action: "leave_type.update", entity: "leave_type", entityId: id, before, after });
    return { leaveType: after, changed: true };
  });
}

export const leaveYearBasisSchema = z.enum(LEAVE_YEAR_BASES, "Choose how the leave year is counted.");

/** Calendar year until someone chooses, because the office has not decided. */
export async function getLeaveYearBasis(db: Pick<Db, "select">): Promise<LeaveYearBasis> {
  const [row] = await db.select({ basis: companySettings.leaveYearBasis }).from(companySettings).where(eq(companySettings.id, 1));
  return row?.basis ?? "calendar";
}

/** Saves how quotas are counted, with an audit row. Saving the same choice writes nothing. */
export async function saveLeaveYearBasis(db: Db, input: unknown, actorId: string): Promise<{ changed: boolean }> {
  const basis = leaveYearBasisSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(companySettings).where(eq(companySettings.id, 1));
    if (before && before.leaveYearBasis === basis) return { changed: false };

    const [after] = await tx
      .insert(companySettings)
      .values({ id: 1, leaveYearBasis: basis })
      .onConflictDoUpdate({ target: companySettings.id, set: { leaveYearBasis: basis, updatedAt: new Date() } })
      .returning();
    await audit(tx, {
      actorId,
      action: before ? "settings.update" : "settings.create",
      entity: "company_settings",
      entityId: "1",
      before,
      after,
    });
    return { changed: true };
  });
}
