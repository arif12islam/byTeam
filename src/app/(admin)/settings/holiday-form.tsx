"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";

import { addHolidayAction } from "./actions";

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
        <Button type="submit" disabled={pending}>
          {pending ? "Adding" : "Add holiday"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
