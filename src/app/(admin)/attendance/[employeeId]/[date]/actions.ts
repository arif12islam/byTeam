"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/field";
import { getDb } from "@/db";
import { addAdjustment } from "@/lib/attendance/adjustments";
import { formError } from "@/lib/form";
import { requireRole } from "@/lib/session";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function adjustDayAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const field = text(formData, "field");
  const result = await addAdjustment(
    getDb(),
    {
      employeeId: text(formData, "employeeId"),
      date: text(formData, "date"),
      // The schema rejects anything that is not a real field.
      field: field as "status" | "first_in" | "last_out",
      value: text(formData, field === "status" ? "statusValue" : "timeValue"),
      reason: text(formData, "reason"),
    },
    user.id,
  );
  if (!result.ok) return formError(formData, result.error);

  revalidatePath("/attendance", "layout");
  revalidatePath("/today");
  return { message: "Saved. The day is updated." };
}
