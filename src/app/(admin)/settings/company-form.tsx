"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldValue } from "@/lib/form";
import { WEEKDAYS } from "@/lib/settings/company";

import { saveCompanyAction } from "./actions";

type Props = {
  name: string;
  weeklyOffDays: number[];
  timezone: string;
  currency: string;
  trackLeavingPunch: boolean;
};

export function CompanyForm({ name, weeklyOffDays, timezone, currency, trackLeavingPunch }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCompanyAction, {});

  return (
    <form action={action} className="space-y-5">
      <Field label="Company name" htmlFor="name">
        <Input id="name" name="name" defaultValue={fieldValue(state, "name", name)} required maxLength={120} autoComplete="organization" />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Weekly off days</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEEKDAYS.map((day) => (
            <label
              key={day.value}
              className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="checkbox"
                name="offDays"
                value={day.value}
                defaultChecked={weeklyOffDays.includes(day.value)}
                className="size-4 accent-primary"
              />
              {day.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {weeklyOffDays.length === 0
            ? "Not set yet. Until you choose, every day counts as a working day."
            : "Punches on these days are marked as worked on an off day."}
        </p>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-card p-3 text-sm">
        <input type="checkbox" name="trackLeavingPunch" defaultChecked={trackLeavingPunch} className="mt-0.5 size-4 accent-primary" />
        <span>
          <span className="font-medium">Use the leaving punch</span>
          <span className="mt-0.5 block text-muted-foreground">
            On: the last punch of the day is the leaving time, and a day with only one punch is flagged. Off: only the first punch counts, so there are no
            missing leaving punches and no early leaving. Applies from today; earlier days stay as they were.
          </span>
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        Time zone {timezone}, currency {currency}.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" pending={pending}>
          Save company settings
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
