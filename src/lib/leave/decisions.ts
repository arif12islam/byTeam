import { and, eq, inArray } from "drizzle-orm";

import type { getDb } from "@/db";
import { leaveRequests, type LeaveStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { recalcAfterLeaveChange } from "@/lib/attendance/triggers";
import { toOfficeDate } from "@/lib/time";

type Db = ReturnType<typeof getDb>;

export const LEAVE_DECISIONS = ["approve", "reject", "cancel"] as const;
export type LeaveDecision = (typeof LEAVE_DECISIONS)[number];

/** Which statuses each decision can start from, and where it ends up. */
const RULES: Record<LeaveDecision, { from: LeaveStatus[]; to: LeaveStatus; verb: string }> = {
  approve: { from: ["pending"], to: "approved", verb: "approved" },
  reject: { from: ["pending"], to: "rejected", verb: "rejected" },
  cancel: { from: ["pending", "approved"], to: "cancelled", verb: "cancelled" },
};

export type DecisionResult = { ok: true; status: LeaveStatus } | { ok: false; error: string };

/**
 * Approves, rejects or cancels a leave request. Approving and rejecting need a
 * pending request; cancelling works on a pending or an approved one. The change,
 * who made it and when, and an audit row are saved together. When the covered
 * days were or become leave (approved, or an approved request cancelled), the
 * attendance days from the first day up to today are recomputed straight away.
 *
 * The status change is a single guarded UPDATE, so two people deciding the same
 * request at once cannot both win.
 */
export async function decideLeave(
  db: Db,
  requestId: string,
  decision: LeaveDecision,
  actorId: string,
  today = toOfficeDate(new Date()),
): Promise<DecisionResult> {
  const rule = RULES[decision];
  if (!rule) return { ok: false, error: "That is not something you can do to a leave request." };

  const outcome = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));
    if (!before) return { ok: false as const, error: "That leave request no longer exists. Reload the page." };

    const [after] = await tx
      .update(leaveRequests)
      .set({ status: rule.to, decidedBy: actorId, decidedAt: new Date() })
      .where(and(eq(leaveRequests.id, requestId), inArray(leaveRequests.status, rule.from)))
      .returning();
    if (!after) {
      return { ok: false as const, error: `That request is already ${before.status === "pending" ? "waiting" : before.status}, so it cannot be ${rule.verb}.` };
    }

    await audit(tx, { actorId, action: `leave.${decision}`, entity: "leave_request", entityId: requestId, before, after });
    return { ok: true as const, before, after };
  });
  if (!outcome.ok) return outcome;

  // Only approved leave touches attendance: approving it, or taking an approved request back.
  const touchedAttendance = decision === "approve" || (decision === "cancel" && outcome.before.status === "approved");
  if (touchedAttendance) {
    await recalcAfterLeaveChange(db, outcome.after.employeeId, outcome.after.fromDate, outcome.after.toDate, today);
  }
  return { ok: true, status: outcome.after.status };
}
