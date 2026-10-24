"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/field";
import { getDb } from "@/db";
import { formError } from "@/lib/form";
import { decideLeave, LEAVE_DECISIONS, type LeaveDecision } from "@/lib/leave/decisions";
import { createLeaveRequest } from "@/lib/leave/requests";
import { requireRole } from "@/lib/session";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function createLeaveRequestAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const result = await createLeaveRequest(
    getDb(),
    {
      employeeId: text(formData, "employeeId"),
      leaveTypeId: text(formData, "leaveTypeId"),
      fromDate: text(formData, "fromDate"),
      // One day of leave: leave the last day empty and it is the same as the first.
      toDate: text(formData, "toDate") || text(formData, "fromDate"),
      note: text(formData, "note"),
    },
    user.id,
  );
  if (!result.ok) return formError(formData, result.error);

  revalidatePath("/leave");
  return { message: `Recorded ${result.days} ${result.days === 1 ? "working day" : "working days"}. It is waiting for approval.` };
}

/** Approve, reject or cancel one request. The server decides what is allowed, not the buttons. */
export async function decideLeaveAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  // "Approve with N days unpaid" is its own button: it approves, and carries the number of unpaid days.
  const approveUnpaid = text(formData, "approveUnpaid");
  const decision = approveUnpaid !== "" ? "approve" : text(formData, "decision");
  if (!(LEAVE_DECISIONS as readonly string[]).includes(decision)) return { error: "That is not something you can do to a leave request." };

  const result = await decideLeave(getDb(), text(formData, "id"), decision as LeaveDecision, user.id, {
    unpaidDays: approveUnpaid === "" ? undefined : Number(approveUnpaid),
  });
  if (!result.ok) {
    // When only the balance is in the way, hand back how many unpaid days would make it fit.
    return result.suggestedUnpaidDays === undefined
      ? { error: result.error }
      : { error: result.error, values: { suggestedUnpaid: String(result.suggestedUnpaidDays) } };
  }

  revalidatePath("/leave");
  revalidatePath("/attendance", "layout");
  revalidatePath("/today");
  return { message: { approve: "Leave approved.", reject: "Leave rejected.", cancel: "Leave cancelled." }[decision as LeaveDecision] };
}
