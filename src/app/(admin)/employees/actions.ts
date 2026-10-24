"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import type { FormState } from "@/components/field";
import { formError } from "@/lib/form";
import { isForeignKeyViolation, isUniqueViolation } from "@/lib/db-errors";
import {
  createEmployee,
  employeeDetailsSchema,
  newEmployeeSchema,
  setEmployeeActive,
  updateEmployee,
} from "@/lib/employees/employees";
import { requireRole } from "@/lib/session";

function detailsFrom(formData: FormData) {
  return {
    name: formData.get("name"),
    department: formData.get("department"),
    designation: formData.get("designation"),
    joinDate: formData.get("joinDate"),
    exitDate: formData.get("exitDate"),
    shiftId: formData.get("shiftId"),
  };
}

export async function createEmployeeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const parsed = newEmployeeSchema.safeParse({ empCode: formData.get("empCode"), ...detailsFrom(formData) });
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  let id: string;
  try {
    id = (await createEmployee(getDb(), parsed.data, user.id)).id;
  } catch (error) {
    if (isUniqueViolation(error)) return formError(formData, "Another employee already has that code.");
    if (isForeignKeyViolation(error)) return formError(formData, "That shift no longer exists. Reload the page.");
    throw error;
  }

  revalidatePath("/employees");
  redirect(`/employees/${id}`);
}

export async function updateEmployeeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole("owner", "hr");

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return formError(formData, "That employee no longer exists.");

  const parsed = employeeDetailsSchema.safeParse(detailsFrom(formData));
  if (!parsed.success) return formError(formData, parsed.error.issues[0].message);

  let result;
  try {
    result = await updateEmployee(getDb(), id.data, parsed.data, user.id);
  } catch (error) {
    if (isForeignKeyViolation(error)) return formError(formData, "That shift no longer exists. Reload the page.");
    throw error;
  }
  if (!result) return formError(formData, "That employee no longer exists.");

  revalidatePath("/employees");
  revalidatePath(`/employees/${id.data}`);
  return { message: result.changed ? "Employee saved." : "Nothing changed." };
}

export async function setActiveAction(formData: FormData): Promise<void> {
  const user = await requireRole("owner", "hr");

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;

  await setEmployeeActive(getDb(), id.data, formData.get("active") === "true", user.id);
  revalidatePath("/employees");
  revalidatePath(`/employees/${id.data}`);
}
