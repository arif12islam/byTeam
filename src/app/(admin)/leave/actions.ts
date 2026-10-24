"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/field";
import { getDb } from "@/db";
import { formError } from "@/lib/form";
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
