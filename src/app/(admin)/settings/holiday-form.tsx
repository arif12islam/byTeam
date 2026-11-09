"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";

import { addHolidayAction, updateHolidayAction } from "./actions";

export function HolidayForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addHolidayAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
        <Field label="Date" htmlFor="holiday-date">
          <Input id="holiday-date" name="date" type="date" defaultValue={fieldValue(state, "date")} required />
        </Field>
        <Field label="Holiday name" htmlFor="holiday-name">
          <Input
            id="holiday-name"
            name="name"
            defaultValue={fieldValue(state, "name")}
            required
            maxLength={120}
            placeholder="Victory Day"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={pending}>
          Add holiday
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Edits one saved holiday, tucked under an Edit button so the list stays short. */
export function EditHolidayForm({ holiday }: { holiday: { id: string; date: string; name: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateHolidayAction, {});

  return (
    <details className="group px-3 pb-3">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium hover:bg-secondary [&::-webkit-details-marker]:hidden">
        Edit
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={holiday.id} />
        <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
          <Field label="Date" htmlFor={`holiday-date-${holiday.id}`}>
            <Input id={`holiday-date-${holiday.id}`} name="date" type="date" defaultValue={fieldValue(state, "date", holiday.date)} required />
          </Field>
          <Field label="Holiday name" htmlFor={`holiday-name-${holiday.id}`}>
            <Input id={`holiday-name-${holiday.id}`} name="name" defaultValue={fieldValue(state, "name", holiday.name)} required maxLength={120} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" pending={pending}>
            Save holiday
          </Button>
          <FormMessage state={state} />
        </div>
      </form>
    </details>
  );
}
