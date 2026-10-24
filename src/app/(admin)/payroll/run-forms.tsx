"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fieldValue } from "@/lib/form";

import { addAdjustmentAction, createRunAction, recomputeRunAction, removeAdjustmentAction } from "./actions";

export function CreateRunForm({ month, label }: { month: string; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRunAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <input type="hidden" name="month" value={month} />
      <Button type="submit" disabled={pending}>
        {pending ? "Creating" : `Create draft for ${label}`}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function RecomputeForm({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(recomputeRunAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="runId" value={runId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Recomputing" : "Recompute sheet"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

const TYPE_OPTIONS = [
  { value: "bonus", label: "Bonus (added)" },
  { value: "advance", label: "Advance (deducted)" },
  { value: "other_addition", label: "Other addition" },
  { value: "other_deduction", label: "Other deduction" },
] as const;

export function AdjustmentForm({ month, people }: { month: string; people: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addAdjustmentAction, {});
  const employeeId = fieldValue(state, "employeeId", "");
  const type = fieldValue(state, "type", "bonus");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="month" value={month} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee" htmlFor="adj-employee">
          <Select key={`employee-${employeeId}`} id="adj-employee" name="employeeId" defaultValue={employeeId} required>
            <option value="" disabled>
              Choose an employee
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kind" htmlFor="adj-type">
          <Select key={`type-${type}`} id="adj-type" name="type" defaultValue={type}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount in taka" htmlFor="adj-amount">
          <Input id="adj-amount" name="amount" type="text" inputMode="decimal" defaultValue={fieldValue(state, "amount")} placeholder="1500" required />
        </Field>
        <Field label="Note" htmlFor="adj-note" hint="Optional. Shown to HR only.">
          <Input id="adj-note" name="note" type="text" maxLength={200} defaultValue={fieldValue(state, "note")} placeholder="Eid bonus" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || people.length === 0}>
          {pending ? "Adding" : "Add amount"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RemoveAdjustmentForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(removeAdjustmentAction, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Removing" : "Remove"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
