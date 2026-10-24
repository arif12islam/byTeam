"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/field";
import { getDb } from "@/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { formError } from "@/lib/form";
import { createRuleSet, ruleSetSchema, updateRuleSet } from "@/lib/payroll/rules";
import { requireRole } from "@/lib/session";
import { formatMonth } from "@/lib/time";

export async function saveRuleSetAction(_previous: FormState, formData: FormData): Promise<FormState> {
  // Only the owner changes pay rules. HR can view them.
  const user = await requireRole("owner");

  const id = formData.get("id");
  const editing = typeof id === "string" && id !== "";

  const parsed = ruleSetSchema.safeParse({
    effectiveFromMonth: formData.get("effectiveFromMonth"),
    lateMode: formData.get("lateMode"),
    lateEveryN: formData.get("lateEveryN"),
    lateAmount: formData.get("lateAmount"),
    deductionBase: formData.get("deductionBase"),
    divisor: formData.get("divisor"),
    unpaidLeaveAsAbsent: formData.get("unpaidLeaveAsAbsent") === "on",
  });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  const db = getDb();
  try {
    if (editing) {
      const result = await updateRuleSet(db, id, parsed.data, user.id);
      if (!result) return formError(formData, "Those rules no longer exist. Reload the page.");
      revalidatePath("/rules");
      return { message: result.changed ? "Rules saved." : "Nothing changed." };
    }
    await createRuleSet(db, parsed.data, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return formError(formData, `Rules already start in ${formatMonth(parsed.data.effectiveFromMonth)}. Change those rules instead.`);
    }
    throw error;
  }

  revalidatePath("/rules");
  return { message: `Rules will apply from ${formatMonth(parsed.data.effectiveFromMonth)}.` };
}
