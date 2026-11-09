"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getDb } from "@/db";
import type { FormState } from "@/components/field";
import { formError } from "@/lib/form";
import { changeLogin } from "@/lib/account";
import { getAuth } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db-errors";
import { createOutage, removeOutage, updateOutage } from "@/lib/attendance/outages";
import { createDepartment, deleteDepartment, renameDepartment } from "@/lib/employees/departments";
import { companySettingsSchema, getCompanySettings, saveCompanySettings } from "@/lib/settings/company";
import { buildCandidates, fetchGoogleFeed, importHolidays, MAX_IMPORT, parseIcs, parsePastedList, type FeedEvent, type HolidayPreviewState } from "@/lib/settings/holiday-import";
import { addHoliday, holidaySchema, listHolidays, removeHoliday, updateHoliday } from "@/lib/settings/holidays";
import { requireRole } from "@/lib/session";
import { toOfficeDate } from "@/lib/time";
import { z } from "zod";

export async function saveCompanyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = companySettingsSchema.safeParse({
    name: formData.get("name"),
    weeklyOffDays: formData.getAll("offDays"),
    // A ticked checkbox sends "on"; an unticked one sends nothing.
    trackLeavingPunch: formData.get("trackLeavingPunch") === "on",
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

export async function changeLoginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { error: "Sign in again and try once more." };

  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const result = await changeLogin(
    getDb(),
    user.id,
    {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      name,
      email,
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    },
    session.session.id,
  );
  // Only name and email go back to the form. Passwords are never echoed.
  if (!result.ok) return { error: result.error, values: { name, email } };

  revalidatePath("/", "layout");
  if (!result.nameChanged && !result.emailChanged && !result.passwordChanged) return { message: "Nothing changed." };
  if (result.passwordChanged) return { message: "Saved. Other devices are signed out and need the new password." };
  return { message: result.emailChanged ? "Saved. Use the new email the next time you sign in." : "Saved." };
}

export async function addDepartmentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const name = String(formData.get("name") ?? "");
  const result = await createDepartment(getDb(), { name }, user.id);
  if (!result.ok) return formError(formData, result.error);

  revalidatePath("/settings");
  revalidatePath("/employees", "layout");
  return { message: `Added ${name.trim()}.` };
}

export async function renameDepartmentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const id = String(formData.get("id") ?? "");
  const result = await renameDepartment(getDb(), id, { name: String(formData.get("name") ?? "") }, user.id);
  if (!result.ok) return formError(formData, result.error);

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function deleteDepartmentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const result = await deleteDepartment(getDb(), String(formData.get("id") ?? ""), user.id);
  if (!result.ok) return { error: result.error };

  revalidatePath("/settings");
  revalidatePath("/employees", "layout");
  return { message: "Deleted." };
}

export async function updateHolidayAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = holidaySchema.safeParse({ date: formData.get("date"), name: formData.get("name") });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  let result;
  try {
    result = await updateHoliday(getDb(), String(formData.get("id") ?? ""), parsed.data, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) return formError(formData, "There is already a holiday on that date.");
    throw error;
  }
  if (!result) return formError(formData, "That holiday no longer exists. Reload the page.");

  revalidatePath("/settings");
  revalidatePath("/attendance");
  return { message: result.changed ? "Saved." : "Nothing changed." };
}

export async function updateOutageAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const result = await updateOutage(
    getDb(),
    String(formData.get("id") ?? ""),
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
  return { message: result.changed ? "Saved." : "Nothing changed." };
}

/** Step one of importing holidays: reads Google's calendar or a pasted list and returns the list to tick from. Saves nothing. */
export async function previewHolidaysAction(_previous: HolidayPreviewState, formData: FormData): Promise<HolidayPreviewState> {
  await requireRole("owner", "hr");

  const year = z.coerce.number().int().min(2000).max(2100).safeParse(formData.get("year"));
  if (!year.success) return { error: "Choose a year." };

  let events: FeedEvent[];
  let problems: string[] = [];
  if (formData.get("source") === "paste") {
    const text = String(formData.get("text") ?? "");
    if (text.trim() === "") return { error: "Paste the list first, one holiday a line, like 2026-12-16 Victory Day." };
    ({ events, problems } = parsePastedList(text.slice(0, 20_000)));
  } else {
    const feed = await fetchGoogleFeed();
    if (!feed.ok) return { error: feed.error };
    events = parseIcs(feed.text);
  }

  const db = getDb();
  const [existing, company] = await Promise.all([listHolidays(db), getCompanySettings(db)]);
  const candidates = buildCandidates(events, {
    year: year.data,
    existingDates: new Set(existing.map((h) => h.date)),
    weeklyOffDays: company.weeklyOffDays,
    today: toOfficeDate(new Date()),
  });
  if (candidates.length === 0) {
    return {
      error: `Nothing found for ${year.data}. Google's calendar may not have that year yet. Paste your own list instead.`,
      problems,
    };
  }
  return { candidates, year: year.data, problems };
}

const pickSchema = z.array(z.string().max(400)).max(MAX_IMPORT);

/** Step two: adds the holidays that were ticked. */
export async function importHolidaysAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const picks = pickSchema.safeParse(formData.getAll("pick"));
  if (!picks.success) return { error: `Pick at most ${MAX_IMPORT} holidays at a time.` };
  const items: { date: string; name: string }[] = [];
  for (const raw of picks.data) {
    try {
      const value: unknown = JSON.parse(raw);
      const parsed = holidaySchema.safeParse(value);
      if (parsed.success) items.push(parsed.data);
    } catch {
      // A value that is not JSON is ignored: nothing but the form sends these.
    }
  }
  if (items.length === 0) return { error: "Tick at least one holiday to add." };

  const result = await importHolidays(getDb(), items, user.id);
  revalidatePath("/settings");
  revalidatePath("/attendance");
  const skipped = result.skipped.length > 0 ? ` ${result.skipped.length} already had a holiday and were left as they are.` : "";
  return { message: `Added ${result.added} ${result.added === 1 ? "holiday" : "holidays"}.${skipped}` };
}
