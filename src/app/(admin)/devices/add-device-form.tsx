"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";

import { addDeviceAction } from "./actions";

export function AddDeviceForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addDeviceAction, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Serial number"
          htmlFor="serialNo"
          hint="Printed on the label at the back of the device, or in its menu under System info."
        >
          <Input
            id="serialNo"
            name="serialNo"
            defaultValue={fieldValue(state, "serialNo")}
            required
            maxLength={64}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="CJDE194960123"
          />
        </Field>
        <Field label="Name" htmlFor="deviceName" hint="Where it is, like Front door.">
          <Input
            id="deviceName"
            name="name"
            defaultValue={fieldValue(state, "name")}
            required
            maxLength={80}
            placeholder="Front door"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={pending}>
          Add device
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
