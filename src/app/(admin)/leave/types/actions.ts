"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/field";
import { getDb } from "@/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { formError } from "@/lib/form";
import { createLeaveType, leaveTypeSchema, leaveYearBasisSchema, saveLeaveYearBasis, updateLeaveType } from "@/lib/leave/types";
import { requireRole } from "@/lib/session";

export async function saveLeaveTypeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const id = formData.get("id");
  const editing = typeof id === "string" && id !== "";

  const parsed = leaveTypeSchema.safeParse({
    name: formData.get("name"),
    yearlyQuota: formData.get("yearlyQuota"),
    isPaid: formData.get("paid") === "paid",
    // New types start active. When editing, the box says whether it stays active.
    active: editing ? formData.get("active") === "on" : true,
  });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  const db = getDb();
  try {
    if (editing) {
      const result = await updateLeaveType(db, id, parsed.data, user.id);
      if (!result) return formError(formData, "That leave type no longer exists. Reload the page.");
      revalidatePath("/leave/types");
      return { message: result.changed ? "Leave type saved." : "Nothing changed." };
    }
    await createLeaveType(db, parsed.data, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) return formError(formData, "Another leave type already has that name.");
    throw error;
  }

  revalidatePath("/leave/types");
  return { message: `Added ${parsed.data.name}.` };
}

export async function saveLeaveYearBasisAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = leaveYearBasisSchema.safeParse(formData.get("basis"));
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  const { changed } = await saveLeaveYearBasis(getDb(), parsed.data, user.id);
  revalidatePath("/leave/types");
  return { message: changed ? "Leave year saved." : "Nothing changed." };
}
