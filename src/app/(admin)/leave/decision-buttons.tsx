"use client";

import { useActionState } from "react";

import { FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";

import { decideLeaveAction } from "./actions";

const buttons = {
  pending: [
    { decision: "approve", label: "Approve leave", variant: "default" },
    { decision: "reject", label: "Reject leave", variant: "outline" },
    { decision: "cancel", label: "Cancel request", variant: "outline" },
  ],
  approved: [{ decision: "cancel", label: "Cancel leave", variant: "outline" }],
} as const;

/** The actions that fit a request's status. Rejected and cancelled requests have none. */
export function DecisionButtons({ id, status }: { id: string; status: "pending" | "approved" | "rejected" | "cancelled" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(decideLeaveAction, {});
  const shown = status === "pending" || status === "approved" ? buttons[status] : [];
  // Once a request is rejected or cancelled it has no buttons left, but the message about what just happened stays.
  if (shown.length === 0 && !state.message && !state.error) return null;

  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {shown.map((b) => (
        <Button key={b.decision} type="submit" name="decision" value={b.decision} variant={b.variant} size="sm" disabled={pending}>
          {b.label}
        </Button>
      ))}
      <FormMessage state={state} />
    </form>
  );
}
