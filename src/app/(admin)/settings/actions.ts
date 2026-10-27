"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getDb } from "@/db";
import type { FormState } from "@/components/field";
import { formError } from "@/lib/form";
import { changeLogin } from "@/lib/account";
import { getAuth } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db-errors";
import { createOutage, removeOutage } from "@/lib/attendance/outages";
import { loadSampleData, switchOffSamplePeople } from "@/lib/demo/sample";
import { companySettingsSchema, saveCompanySettings } from "@/lib/settings/company";
import { addHoliday, holidaySchema, removeHoliday } from "@/lib/settings/holidays";
import { requireRole } from "@/lib/session";

export async function saveCompanyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = companySettingsSchema.safeParse({
    name: formData.get("name"),
    weeklyOffDays: formData.getAll("offDays"),
  });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  const { changed } = await saveCompanySettings(getDb(), parsed.data, user.id);
  revalidatePath("/settings");
  return { message: changed ? "Company settings saved." : "Nothing changed." };
}

export async function addHolidayAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = holidaySchema.safeParse({ date: formData.get("date"), name: formData.get("name") });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  try {
    await addHoliday(getDb(), parsed.data, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) return formError(formData, "There is already a holiday on that date.");
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

export async function addOutageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const result = await createOutage(
    getDb(),
    {
      date: String(formData.get("date") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    },
    user.id,
  );
  if (!result.ok) return formError(formData, result.error);

  revalidatePath("/settings");
  revalidatePath("/attendance");
  return { message: "Outage recorded. Late and absent marks it caused are lifted." };
}

export async function removeOutageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const id = formData.get("id");
  if (typeof id !== "string" || id === "") return { error: "Reload the page and try again." };

  const result = await removeOutage(getDb(), id, user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings");
  revalidatePath("/attendance");
  return { message: "Outage removed." };
}

/** Owner only: adds the sample month, so the screens can be tried before the device is connected. */
export async function loadSampleDataAction(): Promise<FormState> {
  const user = await requireRole("owner");

  const result = await loadSampleData(getDb(), user.id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return {
    message: `Added ${result.summary.employees} sample people (codes ${result.codes[0]} to ${result.codes.at(-1)}) with ${result.summary.punches} punches for ${result.month}.`,
  };
}

/** Owner only: switches every sample person off, so they drop out of Today, Attendance and new payroll runs. */
export async function switchOffSampleAction(): Promise<FormState> {
  const user = await requireRole("owner");

  const count = await switchOffSamplePeople(getDb(), user.id);
  revalidatePath("/", "layout");
  return { message: count === 0 ? "There were no sample people to switch off." : `Switched off ${count} sample people.` };
}

export async function changeLoginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { error: "Sign in again and try once more." };

  const email = String(formData.get("email") ?? "");
  const result = await changeLogin(
    getDb(),
    user.id,
    {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      email,
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    },
    session.session.id,
  );
  // Only the email goes back to the form. Passwords are never echoed.
  if (!result.ok) return { error: result.error, values: { email } };

  revalidatePath("/", "layout");
  if (!result.emailChanged && !result.passwordChanged) return { message: "Nothing changed." };
  const what = [result.emailChanged ? "email" : null, result.passwordChanged ? "password" : null].filter(Boolean).join(" and ");
  return {
    message: result.passwordChanged
      ? `Your ${what} changed. Other devices are signed out and need the new password.`
      : `Your ${what} changed. Use it the next time you sign in.`,
  };
}
