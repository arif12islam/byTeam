"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { fieldValue } from "@/lib/form";

import { saveLeaveYearBasisAction } from "./actions";

export function YearBasisForm({ basis }: { basis: "calendar" | "anniversary" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLeaveYearBasisAction, {});
  const value = fieldValue(state, "basis", basis);

  return (
    <form action={action} className="space-y-4">
      <div className="max-w-sm">
        <Field
          label="Count the yearly days from"
          htmlFor="leave-year-basis"
          hint="Calendar year starts on 1 January for everyone. Joining date starts each person's year on the day they joined."
        >
          <Select key={value} id="leave-year-basis" name="basis" defaultValue={value}>
            <option value="calendar">1 January each year</option>
            <option value="anniversary">Each person&apos;s joining date</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save leave year"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
