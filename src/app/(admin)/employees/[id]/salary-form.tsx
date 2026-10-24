"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";

import { saveSalaryAction } from "./salary-actions";

type Props = {
  employeeId: string;
  /** Starting values, usually the latest salary, so a raise only needs the new gross. */
  start: { gross: string; basicPct: string; housePct: string; medicalPct: string; conveyancePct: string; month: string };
};

const percentProps = {
  type: "text",
  inputMode: "decimal",
  required: true,
  placeholder: "0",
  className: "pr-8",
} as const;

export function SalaryForm({ employeeId, start }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSalaryAction, {});
  const percent = (name: keyof Props["start"], label: string, id: string) => (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <Input id={id} name={name} defaultValue={fieldValue(state, name, start[name])} {...percentProps} />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          %
        </span>
      </div>
    </Field>
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="employeeId" value={employeeId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gross salary per month (taka)" htmlFor="gross">
          <Input
            id="gross"
            name="gross"
            type="text"
            inputMode="decimal"
            required
            placeholder="30000"
            defaultValue={fieldValue(state, "gross", start.gross)}
          />
        </Field>
        <Field
          label="Starts from"
          htmlFor="effectiveMonth"
          hint="Pay for this month and later uses it, until a newer one starts. Saving the same month again replaces it."
        >
          <Input
            id="effectiveMonth"
            name="effectiveMonth"
            type="month"
            required
            defaultValue={fieldValue(state, "effectiveMonth", start.month)}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">How the gross is split</legend>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {percent("basicPct", "Basic", "basicPct")}
          {percent("housePct", "House rent", "housePct")}
          {percent("medicalPct", "Medical", "medicalPct")}
          {percent("conveyancePct", "Conveyance", "conveyancePct")}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The four can add up to 100 or less. Anything left over is shown as other.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save salary"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
