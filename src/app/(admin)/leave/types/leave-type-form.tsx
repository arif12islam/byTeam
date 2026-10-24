"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fieldValue } from "@/lib/form";

import { saveLeaveTypeAction } from "./actions";

type Props = {
  /** Set when editing a saved type. Leave out to add a new one. */
  leaveType?: { id: string; name: string; yearlyQuota: number | null; isPaid: boolean; active: boolean };
};

export function LeaveTypeForm({ leaveType }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLeaveTypeAction, {});
  const prefix = leaveType ? `type-${leaveType.id}` : "type-new";
  const paid = fieldValue(state, "paid", leaveType ? (leaveType.isPaid ? "paid" : "unpaid") : "paid");

  return (
    <form action={action} className="space-y-4">
      {leaveType ? <input type="hidden" name="id" value={leaveType.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor={`${prefix}-name`}>
          <Input id={`${prefix}-name`} name="name" defaultValue={fieldValue(state, "name", leaveType?.name)} required maxLength={60} placeholder="Casual leave" />
        </Field>
        <Field label="Days per year" htmlFor={`${prefix}-quota`} hint="Leave empty for no limit.">
          <Input
            id={`${prefix}-quota`}
            name="yearlyQuota"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={fieldValue(state, "yearlyQuota", leaveType?.yearlyQuota)}
            placeholder="10"
          />
        </Field>
        <Field label="Pay" htmlFor={`${prefix}-paid`}>
          <Select key={`${prefix}-${paid}`} id={`${prefix}-paid`} name="paid" defaultValue={paid}>
            <option value="paid">Paid leave</option>
            <option value="unpaid">Unpaid leave</option>
          </Select>
        </Field>
      </div>
      {leaveType ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={state.values ? state.values.active === "on" : leaveType.active}
            className="size-4 accent-primary"
          />
          In use. Switch this off to stop new requests of this type. Existing requests are kept.
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={pending}>
          {leaveType ? "Save leave type" : "Add leave type"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
