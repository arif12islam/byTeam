"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/field";
import { getDb } from "@/db";
import { formError } from "@/lib/form";
import { addPayrollAdjustment, removePayrollAdjustment } from "@/lib/payroll/adjustments";
import { createDraftRun, recomputeRun } from "@/lib/payroll/runs";
import { requireRole } from "@/lib/session";
import { formatMonth, isValidMonth } from "@/lib/time";

export async function createRunAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const month = formData.get("month");
  if (typeof month !== "string" || !isValidMonth(month)) return formError(formData, "Choose a month for the payroll run.");

  const result = await createDraftRun(getDb(), month, user.id);
  if (!result.ok) return formError(formData, result.error);

  revalidatePath("/payroll");
  return { message: `Draft for ${formatMonth(month)} created.` };
}

export async function recomputeRunAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const id = formData.get("runId");
  if (typeof id !== "string" || id === "") return { error: "Reload the page and try again." };

  const result = await recomputeRun(getDb(), id, user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/payroll");
  return { message: "Sheet updated from the latest attendance, leave and rules." };
}

export async function addAdjustmentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const result = await addPayrollAdjustment(
    getDb(),
    {
      employeeId: formData.get("employeeId") as string,
      month: formData.get("month") as string,
      type: formData.get("type") as "bonus",
      amount: formData.get("amount") as string,
      note: (formData.get("note") as string | null) ?? "",
    },
    user.id,
  );
  if (!result.ok) return formError(formData, result.error);

  revalidatePath("/payroll");
  return { message: "Amount added and the sheet updated." };
}

export async function removeAdjustmentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return { error: "Reload the page and try again." };

  const result = await removePayrollAdjustment(getDb(), id, user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/payroll");
  return { message: "Amount removed." };
}
