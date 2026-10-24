"use client";

import { useActionState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fieldValue } from "@/lib/form";
import type { RuleSetRow } from "@/lib/payroll/rules";

import { saveRuleSetAction } from "./actions";

type Props = {
  /** Set when editing saved rules. Leave out to add rules that start in a new month. */
  ruleSet?: RuleSetRow;
  /** The month the new rules start in unless the owner picks another (YYYY-MM). */
  defaultMonth?: string;
};

// What the office decided on 24 October 2026. Only the starting values of the form for the first rules.
const STARTING_RULES: Omit<RuleSetRow, "id" | "effectiveFromMonth"> = {
  lateMode: "days_per_lates",
  lateEveryN: 3,
  lateAmount: null,
  deductionBase: "gross",
  divisor: "working_days",
  unpaidLeaveAsAbsent: true,
};

export function RuleSetForm({ ruleSet, defaultMonth }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRuleSetAction, {});
  const saved = ruleSet ?? { ...STARTING_RULES, effectiveFromMonth: defaultMonth ?? "" };
  const prefix = ruleSet ? `rules-${ruleSet.id}` : "rules-new";

  const lateMode = fieldValue(state, "lateMode", saved.lateMode);
  const deductionBase = fieldValue(state, "deductionBase", saved.deductionBase);
  const divisor = fieldValue(state, "divisor", saved.divisor);

  return (
    <form action={action} className="space-y-4">
      {ruleSet ? <input type="hidden" name="id" value={ruleSet.id} /> : null}
      {ruleSet ? <input type="hidden" name="effectiveFromMonth" value={ruleSet.effectiveFromMonth} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {ruleSet ? null : (
          <Field label="Starts in" htmlFor={`${prefix}-month`} hint="Earlier months keep the rules they had.">
            <Input
              id={`${prefix}-month`}
              name="effectiveFromMonth"
              type="month"
              required
              defaultValue={fieldValue(state, "effectiveFromMonth", saved.effectiveFromMonth)}
            />
          </Field>
        )}
        <Field label="A day of pay is worked out from" htmlFor={`${prefix}-base`}>
          <Select key={`${prefix}-base-${deductionBase}`} id={`${prefix}-base`} name="deductionBase" defaultValue={deductionBase}>
            <option value="gross">Gross salary</option>
            <option value="basic">Basic salary</option>
          </Select>
        </Field>
        <Field label="Divided by" htmlFor={`${prefix}-divisor`}>
          <Select key={`${prefix}-divisor-${divisor}`} id={`${prefix}-divisor`} name="divisor" defaultValue={divisor}>
            <option value="working_days">Working days in the month</option>
            <option value="month_days">Days in the month</option>
            <option value="thirty">30</option>
          </Select>
        </Field>
      </div>

      {/*
        Which number to show follows the selected option, in CSS: the first option shows the lates
        field and the second shows the amount field, so keep the options in this order. React resets
        a form after each action, and a state variable would not follow that reset. Both inputs are
        always sent and the server keeps the one that belongs to the chosen mode.
      */}
      <div className="group/late grid gap-4 sm:grid-cols-3">
        <Field label="Lates" htmlFor={`${prefix}-late-mode`} hint="Grace minutes are set on each shift.">
          <Select key={`${prefix}-late-${lateMode}`} id={`${prefix}-late-mode`} name="lateMode" defaultValue={lateMode}>
            <option value="days_per_lates">Several lates cost one day</option>
            <option value="fixed_per_late">Each late costs a fixed amount</option>
            <option value="none">Lates cost nothing</option>
          </Select>
        </Field>
        <div className="hidden group-has-[option:nth-child(1):checked]/late:block">
          <Field label="Lates that cost one day" htmlFor={`${prefix}-every-n`}>
            <Input
              id={`${prefix}-every-n`}
              name="lateEveryN"
              type="text"
              inputMode="numeric"
              defaultValue={fieldValue(state, "lateEveryN", saved.lateEveryN)}
              placeholder="3"
            />
          </Field>
        </div>
        <div className="hidden group-has-[option:nth-child(2):checked]/late:block">
          <Field label="Taka per late" htmlFor={`${prefix}-amount`}>
            <Input
              id={`${prefix}-amount`}
              name="lateAmount"
              type="text"
              inputMode="decimal"
              defaultValue={fieldValue(state, "lateAmount", saved.lateAmount)}
              placeholder="50"
            />
          </Field>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="unpaidLeaveAsAbsent"
          defaultChecked={state.values ? state.values.unpaidLeaveAsAbsent === "on" : saved.unpaidLeaveAsAbsent}
          className="size-4 accent-primary"
        />
        Deduct unpaid leave days like absent days
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : ruleSet ? "Save rules" : "Add rules"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
