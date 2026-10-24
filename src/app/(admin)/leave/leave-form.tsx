"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fieldValue } from "@/lib/form";

import { createLeaveRequestAction } from "./actions";

type Props = {
  employees: { id: string; name: string; empCode: string }[];
  leaveTypes: { id: string; name: string }[];
};

export function LeaveForm({ employees, leaveTypes }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(createLeaveRequestAction, {});
  // Remount the dropdowns after each save so React's form reset lands on what was chosen.
  const employeeId = fieldValue(state, "employeeId");
  const leaveTypeId = fieldValue(state, "leaveTypeId");

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee" htmlFor="leave-employee">
          <Select key={`e-${employeeId}`} id="leave-employee" name="employeeId" defaultValue={employeeId} required>
            <option value="" disabled>
              Choose an employee
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.empCode})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Leave type" htmlFor="leave-type">
          <Select key={`t-${leaveTypeId}`} id="leave-type" name="leaveTypeId" defaultValue={leaveTypeId} required>
            <option value="" disabled>
              Choose a leave type
            </option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="First day" htmlFor="leave-from">
          <Input id="leave-from" name="fromDate" type="date" defaultValue={fieldValue(state, "fromDate")} required />
        </Field>
        <Field label="Last day" htmlFor="leave-to" hint="Leave empty for a single day. Weekly off days and holidays are not counted.">
          <Input id="leave-to" name="toDate" type="date" defaultValue={fieldValue(state, "toDate")} />
        </Field>
      </div>
      <Field label="Note" htmlFor="leave-note" hint="Optional. For example, the reason the employee gave.">
        <Input id="leave-note" name="note" defaultValue={fieldValue(state, "note")} maxLength={300} />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Record leave"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
