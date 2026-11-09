"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";

import { addOutageAction, removeOutageAction, updateOutageAction } from "./actions";

export function OutageForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addOutageAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="outage-date">
          <Input id="outage-date" name="date" type="date" defaultValue={fieldValue(state, "date")} required />
        </Field>
        <Field label="Started at" htmlFor="outage-start">
          <Input id="outage-start" name="startTime" type="time" defaultValue={fieldValue(state, "startTime")} required />
        </Field>
        <Field label="Ended at" htmlFor="outage-end">
          <Input id="outage-end" name="endTime" type="time" defaultValue={fieldValue(state, "endTime")} required />
        </Field>
      </div>
      <Field label="What happened" htmlFor="outage-reason" hint="For example: power cut, the device was off.">
        <Input id="outage-reason" name="reason" maxLength={200} defaultValue={fieldValue(state, "reason")} required placeholder="Power cut" />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={pending}>
          Record outage
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RemoveOutageForm({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(removeOutageAction, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" pending={pending} aria-label={`Remove outage ${label}`}>
        Remove
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

/** Edits one saved outage, tucked under an Edit button. */
export function EditOutageForm({ outage }: { outage: { id: string; date: string; startTime: string; endTime: string; reason: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateOutageAction, {});

  return (
    <details className="w-full">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium hover:bg-secondary [&::-webkit-details-marker]:hidden">
        Edit
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={outage.id} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" htmlFor={`outage-date-${outage.id}`}>
            <Input id={`outage-date-${outage.id}`} name="date" type="date" defaultValue={fieldValue(state, "date", outage.date)} required />
          </Field>
          <Field label="Started at" htmlFor={`outage-start-${outage.id}`}>
            <Input id={`outage-start-${outage.id}`} name="startTime" type="time" defaultValue={fieldValue(state, "startTime", outage.startTime)} required />
          </Field>
          <Field label="Ended at" htmlFor={`outage-end-${outage.id}`}>
            <Input id={`outage-end-${outage.id}`} name="endTime" type="time" defaultValue={fieldValue(state, "endTime", outage.endTime)} required />
          </Field>
        </div>
        <Field label="What happened" htmlFor={`outage-reason-${outage.id}`}>
          <Input id={`outage-reason-${outage.id}`} name="reason" maxLength={200} defaultValue={fieldValue(state, "reason", outage.reason)} required />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" pending={pending}>
            Save outage
          </Button>
          <FormMessage state={state} />
        </div>
      </form>
    </details>
  );
}
