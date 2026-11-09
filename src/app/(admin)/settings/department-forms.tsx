"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";
import type { DepartmentRow } from "@/lib/employees/departments";

import { addDepartmentAction, deleteDepartmentAction, renameDepartmentAction } from "./actions";

export function AddDepartmentForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addDepartmentAction, {});

  return (
    <form action={action} className="space-y-4">
      <Field label="Department name" htmlFor="department-name">
        <Input id="department-name" name="name" defaultValue={fieldValue(state, "name")} required maxLength={80} placeholder="Accounts" />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={pending}>
          Add department
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** One department: rename it (everyone in it follows) or delete it once it is empty. */
export function DepartmentRowForms({ department }: { department: DepartmentRow }) {
  const [renameState, rename, renaming] = useActionState<FormState, FormData>(renameDepartmentAction, {});
  const [deleteState, remove, deleting] = useActionState<FormState, FormData>(deleteDepartmentAction, {});

  return (
    <li className="px-3 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <form action={rename} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={department.id} />
          <div className="min-w-[10rem] flex-1">
            <label htmlFor={`department-${department.id}`} className="text-xs text-muted-foreground">
              {department.employeeCount === 1 ? "1 employee" : `${department.employeeCount} employees`}
            </label>
            <Input
              id={`department-${department.id}`}
              name="name"
              defaultValue={fieldValue(renameState, "name", department.name)}
              required
              maxLength={80}
              className="mt-1"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" pending={renaming} aria-label={`Save name for ${department.name}`}>
            Save name
          </Button>
        </form>
        <form action={remove}>
          <input type="hidden" name="id" value={department.id} />
          <Button type="submit" variant="ghost" size="sm" pending={deleting} aria-label={`Delete ${department.name}`}>
            Delete
          </Button>
        </form>
      </div>
      <FormMessage state={renameState.error || renameState.message ? renameState : deleteState} />
    </li>
  );
}
