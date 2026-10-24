"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";

import { renameDeviceAction, sendEmployeesAction, setDeviceActiveAction } from "./actions";

type Props = {
  device: { id: string; serialNo: string; name: string; active: boolean };
};

/** Rename and enable or disable one device. Status is shown by the page around it. */
export function DeviceControls({ device }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(renameDeviceAction, {});
  const [sendState, sendAction, sending] = useActionState<FormState, FormData>(sendEmployeesAction, {});

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={device.id} />
        <div className="min-w-48 flex-1">
          <Field label="Name" htmlFor={`name-${device.id}`}>
            <Input
              id={`name-${device.id}`}
              name="name"
              defaultValue={fieldValue(state, "name", device.name)}
              required
              maxLength={80}
            />
          </Field>
        </div>
        <Button type="submit" variant="outline" pending={pending}>
          Save name
        </Button>
      </form>
      <FormMessage state={state} />

      {device.active ? (
        <div>
          <form action={sendAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="serialNo" value={device.serialNo} />
            <Button type="submit" variant="outline" size="sm" pending={sending}>
              Send all employees to this device
            </Button>
            <p className="text-xs text-muted-foreground">
              New and renamed employees are sent automatically. Use this for people added before the device was.
            </p>
          </form>
          <div className="mt-2">
            <FormMessage state={sendState} />
          </div>
        </div>
      ) : null}

      <form action={setDeviceActiveAction}>
        <input type="hidden" name="id" value={device.id} />
        <input type="hidden" name="active" value={device.active ? "false" : "true"} />
        <Button type="submit" variant="outline" size="sm" className={device.active ? "border-danger/40 text-danger hover:bg-danger-soft" : undefined}>
          {device.active ? "Stop accepting this device" : "Accept this device again"}
        </Button>
      </form>
    </div>
  );
}
