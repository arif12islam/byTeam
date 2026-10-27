"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";

import { changeLoginAction } from "./actions";

export function LoginForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeLoginAction, {});

  return (
    <form action={action} className="space-y-5">
      <Field label="Email" htmlFor="login-email" hint="The email you sign in with.">
        <Input id="login-email" name="email" type="email" defaultValue={fieldValue(state, "email", email)} required autoComplete="username" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="New password" htmlFor="new-password" hint="At least 8 characters. Leave empty to keep your password.">
          <Input id="new-password" name="newPassword" type="password" minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="New password again" htmlFor="confirm-password">
          <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" />
        </Field>
      </div>

      <Field label="Current password" htmlFor="current-password" hint="Needed to change anything here.">
        <Input id="current-password" name="currentPassword" type="password" required autoComplete="current-password" />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={pending}>
          Save login
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
