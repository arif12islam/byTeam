import { and, eq, inArray, ne } from "drizzle-orm";

import type { getDb } from "@/db";
import { employees, leaveRequests, leaveTypes, type LeaveStatus } from "@/db/schema";
import { audit } from "@/lib/audit";
import { recalcAfterLeaveChange } from "@/lib/attendance/triggers";
import { finalizedMonthsBetween, lockedMessage } from "@/lib/payroll/lock";
import { formatOfficeDate, toOfficeDate } from "@/lib/time";

import { checkBalance, suggestUnpaidDays } from "./balances";
import { loadLeaveCalendar } from "./requests";
import { getLeaveYearBasis } from "./types";
import { leaveYearsBetween } from "./year";

type Db = ReturnType<typeof getDb>;

export const LEAVE_DECISIONS = ["approve", "reject", "cancel"] as const;
export type LeaveDecision = (typeof LEAVE_DECISIONS)[number];

/** Which statuses each decision can start from, and where it ends up. */
const RULES: Record<LeaveDecision, { from: LeaveStatus[]; to: LeaveStatus; verb: string }> = {
  approve: { from: ["pending"], to: "approved", verb: "approved" },
  reject: { from: ["pending"], to: "rejected", verb: "rejected" },
  cancel: { from: ["pending", "approved"], to: "cancelled", verb: "cancelled" },
};

export type DecisionResult =
  | { ok: true; status: LeaveStatus }
  /** suggestedUnpaidDays is set when approving failed only because the balance ran out. */
  | { ok: false; error: string; suggestedUnpaidDays?: number };

export type DecisionOptions = {
  /** The office date counted as today. Only tests change it. */
  today?: string;
  /**
   * Approving only: how many of the request's days to record as unpaid, the last
   * ones, so the rest fit in the balance. Leave out to keep what the request has.
   */
  unpaidDays?: number;
};

/**
 * Approves, rejects or cancels a leave request. Approving and rejecting need a
 * pending request; cancelling works on a pending or an approved one. The change,
 * who made it and when, and an audit row are saved together. When the covered
 * days were or become leave (approved, or an approved request cancelled), the
 * attendance days from the first day up to today are recomputed straight away.
 *
 * Refused when the request touches a month whose payroll is finalized.
 *
 * The status change is a single guarded UPDATE, so two people deciding the same
 * request at once cannot both win.
 *
 * Approving is refused when the request goes past the person's leave balance
 * for its type, unless the extra days are recorded as unpaid (`unpaidDays`). The
 * refusal carries the number of unpaid days that would make it fit. Approvals
 * for the same person are done one at a time, so two together cannot both pass
 * the check and overspend the balance.
 */
export async function decideLeave(
  db: Db,
  requestId: string,
  decision: LeaveDecision,
  actorId: string,
  options: DecisionOptions = {},
): Promise<DecisionResult> {
  const today = options.today ?? toOfficeDate(new Date());
  const rule = RULES[decision];
  if (!rule) return { ok: false, error: "That is not something you can do to a leave request." };

  const outcome = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, requestId));
    if (!before) return { ok: false as const, error: "That leave request no longer exists. Reload the page." };

    const locked = await finalizedMonthsBetween(tx, before.fromDate, before.toDate, { lock: true });
    if (locked.size > 0) return { ok: false as const, error: lockedMessage(locked, "this leave request") };

    let unpaidDays = before.unpaidDays;
    if (decision === "approve") {
      const approval = await checkApproval(tx, before, options.unpaidDays);
      if (!approval.ok) return { ok: false as const, error: approval.problem, suggestedUnpaidDays: approval.suggestedUnpaidDays };
      unpaidDays = approval.unpaidDays;
    }

    const [after] = await tx
      .update(leaveRequests)
      .set({ status: rule.to, unpaidDays, decidedBy: actorId, decidedAt: new Date() })
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

type Tx = Pick<Db, "select">;

/** Everything that decides whether approving fits the balance. Locks the employee's row first. */
async function checkApproval(
  tx: Tx,
  request: typeof leaveRequests.$inferSelect,
  requestedUnpaidDays: number | undefined,
): Promise<{ ok: true; unpaidDays: number } | { ok: false; problem: string; suggestedUnpaidDays?: number }> {
  const unpaidDays = requestedUnpaidDays ?? request.unpaidDays;
  if (!Number.isInteger(unpaidDays) || unpaidDays < 0 || unpaidDays > request.days) {
    return { ok: false, problem: `Unpaid days must be a whole number from 0 to ${request.days}.` };
  }

  // Held until the transaction ends: approvals for one person line up behind each other.
  const [person] = await tx.select().from(employees).where(eq(employees.id, request.employeeId)).for("update");
  const [type] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, request.leaveTypeId));
  if (!person || !type) return { ok: false, problem: "The employee or leave type for this request no longer exists." };

  const basis = await getLeaveYearBasis(tx);
  const years = leaveYearsBetween(basis, person.joinDate, request.fromDate, request.toDate);
  const windowFrom = years[0].from;
  const windowTo = years[years.length - 1].to;

  const others = await tx
    .select({ fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, unpaidDays: leaveRequests.unpaidDays })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, request.employeeId),
        eq(leaveRequests.leaveTypeId, request.leaveTypeId),
        eq(leaveRequests.status, "approved"),
        ne(leaveRequests.id, request.id),
      ),
    );
  const relevant = others.filter((o) => o.toDate >= windowFrom && o.fromDate <= windowTo);

  const span = [request.fromDate, ...relevant.map((o) => o.fromDate), windowFrom].sort()[0];
  const spanEnd = [request.toDate, ...relevant.map((o) => o.toDate), windowTo].sort().at(-1)!;
  const calendar = await loadLeaveCalendar(tx, span, spanEnd);

  const input = {
    request: { fromDate: request.fromDate, toDate: request.toDate, days: request.days, unpaidDays },
    others: relevant,
    quota: type.yearlyQuota,
    joinDate: person.joinDate,
    basis,
    calendar,
  };
  const check = checkBalance(input);
  if (check.ok) return { ok: true, unpaidDays };

  const suggested = suggestUnpaidDays(input);
  const extra = suggested - unpaidDays;
  return {
    ok: false,
    problem:
      `${person.name} has ${check.available} ${check.available === 1 ? "day" : "days"} of ${type.name} left ` +
      `(${formatOfficeDate(check.year.from)} to ${formatOfficeDate(check.year.to)}), but this request needs ${check.needed}. ` +
      (extra > 0 ? `Approve it with ${suggested} ${suggested === 1 ? "day" : "days"} unpaid, or reject it.` : "Reject it, or change the unpaid days."),
    suggestedUnpaidDays: suggested,
  };
}
