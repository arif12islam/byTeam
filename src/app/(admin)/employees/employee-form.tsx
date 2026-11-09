"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fieldValue } from "@/lib/form";

import { createEmployeeAction, updateEmployeeAction } from "./actions";

type ShiftOption = { id: string; name: string; startTime: string; endTime: string };

type Props = {
  shifts: ShiftOption[];
  /** The department names to choose from, from Settings. */
  departments: string[];
  /** A code to start with when adding, for example one that punched with no employee. */
  initialCode?: string;
  /** Set when editing a saved employee. Leave out to add a new one. */
  employee?: {
    id: string;
    empCode: string;
    name: string;
    department: string | null;
    designation: string | null;
    joinDate: string;
    exitDate: string | null;
    shiftId: string;
  };
};

export function EmployeeForm({ shifts, departments, employee, initialCode }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    employee ? updateEmployeeAction : createEmployeeAction,
    {},
  );

  return (
    <form action={action} className="space-y-5">
      {employee ? <input type="hidden" name="id" value={employee.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Employee code"
          htmlFor="empCode"
          hint={
            employee
              ? "The code cannot change. Past punches are matched to people by it."
              : "The number this person enters on the device. It cannot be changed later."
          }
        >
          <Input
            id="empCode"
            name="empCode"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={24}
            defaultValue={fieldValue(state, "empCode", employee?.empCode ?? initialCode)}
            readOnly={Boolean(employee)}
            required
            placeholder="1001"
            className={employee ? "bg-secondary" : undefined}
          />
        </Field>
        <Field label="Full name" htmlFor="name">
          <Input id="name" name="name" defaultValue={fieldValue(state, "name", employee?.name)} required maxLength={120} autoComplete="off" />
        </Field>
        <Field
          label="Department"
          htmlFor="department"
          hint={
            departments.length === 0 ? (
              <>
                No departments yet.{" "}
                <Link href="/settings?tab=company#departments" className="text-primary underline underline-offset-4">
                  Add one in Settings
                </Link>
                .
              </>
            ) : (
              <>
                Missing one?{" "}
                <Link href="/settings?tab=company#departments" className="text-primary underline underline-offset-4">
                  Manage departments
                </Link>
                .
              </>
            )
          }
        >
          <Select
            key={`${state.values?.department ?? "saved"}-${employee?.department ?? "new"}`}
            id="department"
            name="department"
            defaultValue={fieldValue(state, "department", employee?.department)}
          >
            <option value="">No department</option>
            {/* A name from before the list existed stays selectable, so saving other changes does not drop it. */}
            {employee?.department && !departments.includes(employee.department) ? (
              <option value={employee.department}>{employee.department} (not in the list)</option>
            ) : null}
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Designation" htmlFor="designation">
          <Input id="designation" name="designation" defaultValue={fieldValue(state, "designation", employee?.designation)} maxLength={80} />
        </Field>
        <Field label="Join date" htmlFor="joinDate">
          <Input id="joinDate" name="joinDate" type="date" defaultValue={fieldValue(state, "joinDate", employee?.joinDate)} required />
        </Field>
        <Field
          label="Exit date"
          htmlFor="exitDate"
          hint="Leave empty while the person works here. Attendance and pay stop after this day."
        >
          <Input id="exitDate" name="exitDate" type="date" defaultValue={fieldValue(state, "exitDate", employee?.exitDate)} />
        </Field>
        <Field label="Shift" htmlFor="shiftId">
          {/* React does not re-apply a changed default to a select, so the key remounts it after an error and after the saved shift changes. */}
          <Select
            key={`${state.values?.shiftId ?? "saved"}-${employee?.shiftId ?? "new"}`}
            id="shiftId"
            name="shiftId"
            defaultValue={fieldValue(state, "shiftId", employee?.shiftId)}
            required
          >
            {employee ? null : (
              <option value="" disabled>
                Choose a shift
              </option>
            )}
            {shifts.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {shift.name} ({shift.startTime} to {shift.endTime})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={pending}>
          {employee ? "Save employee" : "Add employee"}
        </Button>
        {employee ? null : (
          <Link href="/employees" className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        )}
        <FormMessage state={state} />
      </div>
    </form>
  );
}
