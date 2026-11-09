"use client";

import { useActionState, useState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { deleteEmployeeWithHistoryAction } from "../actions";

/** Asks for the person's name before it deletes anything; the server checks it again. */
export function DeleteWithHistoryForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteEmployeeWithHistoryAction, {});
  const [typed, setTyped] = useState("");
  const matches = typed.trim().replace(/\s+/g, " ") === name.trim().replace(/\s+/g, " ");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <Field label={`Type ${name} to confirm`} htmlFor="confirmName">
        <Input
          id="confirmName"
          name="confirmName"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" pending={pending} disabled={!matches} className="text-destructive">
          Delete employee and history
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
