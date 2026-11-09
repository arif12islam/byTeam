"use client";

import { useActionState } from "react";

import { FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";

type Props = {
  /** A server action that deletes the record named by the hidden `id` field. */
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  id: string;
  /** The button text, for example "Delete shift". */
  label: string;
  /** Asked before anything is deleted. */
  confirmText: string;
};

/**
 * A delete button that asks first, and shows what the server says when it
 * refuses (for example because the record is still in use).
 */
export function DeleteForm({ action, id, label, confirmText }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" pending={pending} className="text-destructive">
        {label}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
