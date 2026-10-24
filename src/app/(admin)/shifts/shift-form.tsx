"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveShiftAction } from "./actions";

type Props = {
  /** Set when editing a saved shift. Leave out to add a new one. */
  shift?: { id: string; name: string; startTime: string; endTime: string; graceMinutes: number };
};

export function ShiftForm({ shift }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveShiftAction, {});
  const prefix = shift ? `shift-${shift.id}` : "shift-new";

  return (
    <form action={action} className="space-y-4">
      {shift ? <input type="hidden" name="id" value={shift.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Shift name" htmlFor={`${prefix}-name`}>
          <Input id={`${prefix}-name`} name="name" defaultValue={shift?.name} required maxLength={60} placeholder="Day" />
        </Field>
        <Field label="Start" htmlFor={`${prefix}-start`}>
          <Input id={`${prefix}-start`} name="startTime" type="time" defaultValue={shift?.startTime} required />
        </Field>
        <Field label="End" htmlFor={`${prefix}-end`}>
          <Input id={`${prefix}-end`} name="endTime" type="time" defaultValue={shift?.endTime} required />
        </Field>
        <Field label="Grace minutes" htmlFor={`${prefix}-grace`}>
          <Input
            id={`${prefix}-grace`}
            name="graceMinutes"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={shift?.graceMinutes ?? ""}
            required
            placeholder="10"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : shift ? "Save shift" : "Add shift"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
