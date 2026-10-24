"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import type { FormState } from "@/components/field";
import { isUniqueViolation } from "@/lib/db-errors";
import { companySettingsSchema, saveCompanySettings } from "@/lib/settings/company";
import { addHoliday, holidaySchema, removeHoliday } from "@/lib/settings/holidays";
import { requireRole } from "@/lib/session";

export async function saveCompanyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = companySettingsSchema.safeParse({
    name: formData.get("name"),
    weeklyOffDays: formData.getAll("offDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { changed } = await saveCompanySettings(getDb(), parsed.data, user.id);
  revalidatePath("/settings");
  return { message: changed ? "Company settings saved." : "Nothing changed." };
}

export async function addHolidayAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = holidaySchema.safeParse({ date: formData.get("date"), name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await addHoliday(getDb(), parsed.data, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "There is already a holiday on that date." };
    throw error;
  }
  revalidatePath("/settings");
  return { message: `Added ${parsed.data.name}.` };
}

export async function removeHolidayAction(formData: FormData): Promise<void> {
  const user = await requireRole("owner", "hr");

  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return;

  await removeHoliday(getDb(), id, user.id);
  revalidatePath("/settings");
}
