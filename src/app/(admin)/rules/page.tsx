import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { describeRuleSet, listRuleSets, ruleSetForMonth } from "@/lib/payroll/rules";
import { requireRole } from "@/lib/session";
import { listShifts } from "@/lib/shifts/shifts";
import { formatMonth, toOfficeMonth } from "@/lib/time";

import { RuleSetForm } from "./rule-set-form";

export const metadata: Metadata = { title: "Pay rules" };

export default function RulesPage() {
  return (
    <>
      <PageHeader title="Pay rules" description="How lates, absences and unpaid leave affect salary." />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading pay rules</p>}>
        <RulesContent />
      </Suspense>
    </>
  );
}

async function RulesContent() {
  const user = await requireRole("owner", "hr");
  const canEdit = user.role === "owner";

  const db = getDb();
  const [rules, shifts] = await Promise.all([listRuleSets(db), listShifts(db)]);
  const thisMonth = toOfficeMonth(new Date());
  const current = ruleSetForMonth(rules, thisMonth);

  return (
    <div className="mt-6 grid max-w-4xl gap-6">
      {rules.length === 0 ? (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          {canEdit
            ? "No pay rules yet. Add the rules below before creating a payroll run. The form starts with the rules the office chose."
            : "No pay rules yet. The owner needs to add them before a payroll run can be created."}
        </p>
      ) : null}

      {canEdit ? (
        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="text-base font-semibold">{rules.length === 0 ? "Add the first rules" : "Add rules for a new month"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            New rules apply from the month you pick and stay until later rules take over. Months already paid keep their own rules.
          </p>
          <div className="mt-5">
            <RuleSetForm defaultMonth={thisMonth} />
          </div>
        </section>
      ) : null}

      {rules.map((rule) => (
        <section key={rule.id} className="rounded-lg border border-border bg-card p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">From {formatMonth(rule.effectiveFromMonth)}</h2>
            {current?.id === rule.id ? <p className="text-sm font-medium text-primary">In use this month</p> : null}
          </div>
          {canEdit ? (
            <div className="mt-5">
              <RuleSetForm ruleSet={rule} />
            </div>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {describeRuleSet(rule).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="rounded-lg border border-border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Grace minutes</h2>
          <Link href="/shifts" className="text-sm text-primary underline-offset-4 hover:underline">
            Change on the Shifts screen
          </Link>
        </div>
        {shifts.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No shifts yet. Add a shift to set its grace minutes.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {shifts.map((shift) => (
              <li key={shift.id}>
                {shift.name}: {shift.graceMinutes} {shift.graceMinutes === 1 ? "minute" : "minutes"} after {shift.startTime}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
