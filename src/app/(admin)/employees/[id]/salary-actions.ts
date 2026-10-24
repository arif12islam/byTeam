"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import type { FormState } from "@/components/field";
import { isForeignKeyViolation } from "@/lib/db-errors";
import { formError } from "@/lib/form";
import { salaryInputSchema, saveSalaryStructure } from "@/lib/salary/salary";
import { requireRole } from "@/lib/session";

export async function saveSalaryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const employeeId = z.uuid().safeParse(formData.get("employeeId"));
  if (!employeeId.success) return formError(formData, "That employee no longer exists.");

  const parsed = salaryInputSchema.safeParse({
    gross: formData.get("gross"),
    basicPct: formData.get("basicPct"),
    housePct: formData.get("housePct"),
    medicalPct: formData.get("medicalPct"),
    conveyancePct: formData.get("conveyancePct"),
    effectiveMonth: formData.get("effectiveMonth"),
  });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  let result;
  try {
    result = await saveSalaryStructure(getDb(), employeeId.data, {
      gross: String(formData.get("gross")),
      basicPct: String(formData.get("basicPct")),
      housePct: String(formData.get("housePct")),
      medicalPct: String(formData.get("medicalPct")),
      conveyancePct: String(formData.get("conveyancePct")),
      effectiveMonth: String(formData.get("effectiveMonth")),
    }, user.id);
  } catch (error) {
    if (isForeignKeyViolation(error)) return formError(formData, "That employee no longer exists.");
    throw error;
  }

  revalidatePath(`/employees/${employeeId.data}`);
  if (!result.changed) return { message: "Nothing changed." };
  return { message: result.created ? "Salary added." : "Salary for that month updated." };
}
