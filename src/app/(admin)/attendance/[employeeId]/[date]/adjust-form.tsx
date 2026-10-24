"use client";

import { useActionState, useState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ATTENDANCE_STATUSES } from "@/db/schema/attendance";
import { statusLabel } from "@/lib/attendance/labels";
import { fieldValue } from "@/lib/form";

import { adjustDayAction } from "./actions";

type Props = { employeeId: string; date: string };

export function AdjustForm({ employeeId, date }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(adjustDayAction, {});
  const [field, setField] = useState(state.values?.field ?? "status");
  // React resets form fields after an action. Remounting the dropdown on each submit makes the reset land on the
  // current choice instead of the first option, so it keeps matching the input shown next to it.
  const [submits, setSubmits] = useState(0);

  return (
    <form action={action} onSubmit={() => setSubmits((n) => n + 1)} className="space-y-4">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="date" value={date} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What to change" htmlFor="adjust-field">
          <Select key={`${field}-${submits}`} id="adjust-field" name="field" defaultValue={field} onChange={(e) => setField(e.target.value)}>
            <option value="status">Status</option>
            <option value="first_in">Came in time</option>
            <option value="last_out">Left time</option>
          </Select>
        </Field>
        {field === "status" ? (
          <Field label="New status" htmlFor="adjust-status" hint="Choose the blank option to remove an earlier change.">
            <Select id="adjust-status" name="statusValue" defaultValue={fieldValue(state, "statusValue")}>
              <option value="">Use the calculated status</option>
              {ATTENDANCE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel[status]}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="New time" htmlFor="adjust-time" hint="Leave empty to remove an earlier change.">
            <Input id="adjust-time" name="timeValue" type="time" defaultValue={fieldValue(state, "timeValue")} />
          </Field>
        )}
      </div>
      <Field label="Reason" htmlFor="adjust-reason" hint="Required. It is saved with the change and shown to everyone who opens this day.">
        <Input
          id="adjust-reason"
          name="reason"
          defaultValue={fieldValue(state, "reason")}
          required
          minLength={3}
          maxLength={500}
          placeholder="Forgot to punch out, confirmed with the manager"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save correction"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
