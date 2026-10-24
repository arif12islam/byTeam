"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import type { FormState } from "@/components/field";
import { isUniqueViolation } from "@/lib/db-errors";
import { addDevice, deviceNameSchema, newDeviceSchema, renameDevice, setDeviceActive } from "@/lib/devices/devices";
import { formError } from "@/lib/form";
import { requireRole } from "@/lib/session";

export async function addDeviceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = newDeviceSchema.safeParse({ serialNo: formData.get("serialNo"), name: formData.get("name") });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  try {
    await addDevice(getDb(), parsed.data, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) return formError(formData, "That serial number is already registered.");
    throw error;
  }

  revalidatePath("/devices");
  return { message: `Added ${parsed.data.name}.` };
}

export async function renameDeviceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return formError(formData, "That device no longer exists.");

  const parsed = deviceNameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  const result = await renameDevice(getDb(), id.data, parsed.data.name, user.id);
  if (!result) return formError(formData, "That device no longer exists.");

  revalidatePath("/devices");
  return { message: result.changed ? "Name saved." : "Nothing changed." };
}

export async function setDeviceActiveAction(formData: FormData): Promise<void> {
  const user = await requireRole("owner", "hr");

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  await setDeviceActive(getDb(), id.data, formData.get("active") === "true", user.id);
  revalidatePath("/devices");
}
