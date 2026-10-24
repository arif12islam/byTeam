"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import type { FormState } from "@/components/field";
import { formError } from "@/lib/form";
import { isUniqueViolation } from "@/lib/db-errors";
import { createShift, shiftSchema, updateShift } from "@/lib/shifts/shifts";
import { requireRole } from "@/lib/session";

export async function saveShiftAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = shiftSchema.safeParse({
    name: formData.get("name"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    graceMinutes: formData.get("graceMinutes"),
  });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  const id = formData.get("id");
  const db = getDb();

  try {
    if (typeof id === "string" && id !== "") {
      const result = await updateShift(db, id, parsed.data, user.id);
      if (!result) return formError(formData, "That shift no longer exists. Reload the page.");
      revalidatePath("/shifts");
      return { message: result.changed ? "Shift saved." : "Nothing changed." };
    }

    await createShift(db, parsed.data, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) return formError(formData, "Another shift already has that name.");
    throw error;
  }

  revalidatePath("/shifts");
  return { message: `Added ${parsed.data.name}.` };
}
