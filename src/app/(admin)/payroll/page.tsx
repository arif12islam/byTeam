import { Download, Gift, Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { MonthNav } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { HeroPanel } from "@/components/ui/hero-panel";
import { HeroStat } from "@/components/ui/hero-stat";
import { getDb } from "@/db";
import { ADJUSTMENT_LABELS } from "@/lib/payroll/adjustments";
import { describeRunStatus } from "@/lib/payroll/status";
import { listPayrollRuns, loadPayrollSheet } from "@/lib/payroll/runs";
import { formatTakaSigned as taka } from "@/lib/salary/money";
import { requireRole } from "@/lib/session";
import { formatMonth, isValidMonth, toOfficeMonth } from "@/lib/time";

import { AdjustmentForm, CreateRunForm, FinalizeForm, RecomputeForm, RemoveAdjustmentForm, UnlockForm } from "./run-forms";
import { SalarySheet } from "./salary-sheet";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage(props: PageProps<"/payroll">) {
  return (
    <>
      <PageHeader title="Payroll" description="Run the month's salaries from attendance and leave, then review the sheet." />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading payroll</p>}>
        <PayrollContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}


async function PayrollContent({ searchParams }: { searchParams: PageProps<"/payroll">["searchParams"] }) {
  const user = await requireRole("owner", "hr");

  const thisMonth = toOfficeMonth(new Date());
  const { month: requested } = await searchParams;
  const month = typeof requested === "string" && isValidMonth(requested) ? requested : thisMonth;

  const db = getDb();
  const [sheet, runs] = await Promise.all([loadPayrollSheet(db, month), listPayrollRuns(db)]);
  const locked = sheet?.run.status === "finalized";

  const status = sheet ? describeRunStatus(sheet.run) : null;
  const isOwner = user.role === "owner";

  return (
    <div className="mt-6 grid gap-5">
      {sheet === null ? (
        <HeroPanel title={`Payroll for ${formatMonth(month)}`} eyebrow="No payroll run yet">
          <MonthNav basePath="/payroll" month={month} thisMonth={thisMonth} />
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ["Create a draft from attendance and leave", "Everyone's pay is worked out from the pay rules."],
              ["Review and add bonuses or advances", "Check the sheet, add amounts, recompute as often as you like."],
              ["Finalize to lock the month", "The admin locks it. Payslips are ready after that."],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-3 rounded-xl border border-border bg-card/80 px-3.5 py-3">
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-soft-foreground ring-1 ring-brand-border">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="sr-only">{`Step ${i + 1}: `}</span>
                    {title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5">
            <CreateRunForm month={month} label={formatMonth(month)} />
          </div>
        </HeroPanel>
      ) : (
        <>
          <HeroPanel>
            <MonthNav basePath="/payroll" month={month} thisMonth={thisMonth} />
            <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  Net pay for {formatMonth(month)}
                  <Badge tone={status!.tone}>{status!.badge}</Badge>
                </p>
                <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{taka(sheet.totals.net)}</p>
                <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{status!.detail}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <HeroStat label="Gross" value={taka(sheet.totals.gross)} />
              <HeroStat label="Deductions" value={taka(sheet.totals.deductions)} />
              <HeroStat label="Additions" value={taka(sheet.totals.additions)} />
              <HeroStat label="People paid" value={sheet.rows.length} />
            </div>
            <div className="mt-5 border-t border-brand-border pt-5">
              {locked ? (
                <div className="flex flex-wrap items-start gap-3">
                  <a href={`/payroll/payslip?month=${month}`} className={buttonVariants({ variant: "outline" })}>
                    <Download aria-hidden />
                    Download all payslips (PDF)
                  </a>
                  <a href={`/payroll/export?month=${month}`} className={buttonVariants({ variant: "outline" })}>
                    <Download aria-hidden />
                    Download salary sheet (Excel)
                  </a>
                  {isOwner ? (
                    <div className="w-full">
                      <h2 className="text-sm font-semibold">Need to change something?</h2>
                      <p className="mt-1 mb-3 max-w-prose text-sm text-muted-foreground">
                        Unlocking takes the month back to a draft. Fix what is wrong, recompute the sheet, then finalize again.
                      </p>
                      <UnlockForm runId={sheet.run.id} label={formatMonth(month)} />
                    </div>
                  ) : (
                    <p className="w-full text-sm text-muted-foreground">Only the admin can unlock a month.</p>
                  )}
                </div>
              ) : (
                <div className="grid gap-4">
                  <RecomputeForm runId={sheet.run.id} />
                  {sheet.rows.length > 0 ? (
                    isOwner ? (
                      <div>
                        <h2 className="text-sm font-semibold">Finalize payroll</h2>
                        <p className="mt-1 mb-3 max-w-prose text-sm text-muted-foreground">
                          Check the sheet and the breakdowns first. Finalizing recalculates once more, keeps a copy of the pay rules, and locks the month.
                        </p>
                        <FinalizeForm runId={sheet.run.id} label={formatMonth(month)} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Only the admin can finalize a month. Ask them to review this sheet.</p>
                    )
                  ) : null}
                </div>
              )}
            </div>
          </HeroPanel>

          {sheet.notices.map((notice) => (
            <Alert key={notice} tone="danger" icon={TriangleAlert}>
              {notice}
            </Alert>
          ))}

          {sheet.skipped.length > 0 ? (
            <Alert tone="warning" icon={TriangleAlert}>
              Not in this sheet because no salary is set:{" "}
              {sheet.skipped.map((s, i) => (
                <span key={s.employeeId}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/employees/${s.employeeId}`} className="text-brand underline-offset-4 hover:underline">
                    {s.name}
                  </Link>
                </span>
              ))}
              .
            </Alert>
          ) : null}

          {sheet.rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
              No one has a salary set for {formatMonth(month)}. Add a salary structure on an employee&apos;s page, then recompute.
            </p>
          ) : (
            <SalarySheet rows={sheet.rows} totals={sheet.totals} month={month} locked={locked} />
          )}

          {sheet.rows.length > 0 ? (
            <section className="grid gap-2">
              <h2 className="text-base font-semibold">How each net pay was worked out</h2>
              {sheet.rows.map((row) => (
                <details key={row.employeeId} className="rounded-xl border border-border bg-card px-4 py-3 shadow-card">
                  <summary className="cursor-pointer text-sm font-medium">
                    {row.name} <span className="font-normal text-muted-foreground">· net {taka(row.net)}</span>
                    {row.warnings.length > 0 ? <Badge tone="warning" className="ml-2">Check this</Badge> : null}
                  </summary>
                  <ul className="mt-3 space-y-1 text-sm">
                    {row.lines.map((line) => (
                      <li key={line.code} className="flex justify-between gap-4">
                        <span>{line.label}</span>
                        <span className="tabular-nums">
                          {line.sign === "-" ? "-" : ""}
                          {taka(line.amount)}
                        </span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-4 border-t border-border pt-1 font-medium">
                      <span>Net pay, rounded to a whole taka</span>
                      <span className="tabular-nums">{taka(row.net)}</span>
                    </li>
                  </ul>
                  {row.warnings.map((w) => (
                    <p key={w} className="mt-3 text-sm text-destructive">
                      {w}
                    </p>
                  ))}
                  {locked ? (
                    <a
                      href={`/payroll/payslip?month=${month}&employee=${row.employeeId}`}
                      className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}
                    >
                      Download payslip (PDF)
                    </a>
                  ) : null}
                </details>
              ))}
            </section>
          ) : null}

          <Card>
            <CardTitle icon={Gift} count={sheet.adjustments.length}>
              Bonuses and advances
            </CardTitle>
            {locked ? (
              <p className="mt-1.5 text-sm text-muted-foreground">This month is finalized, so amounts cannot be changed.</p>
            ) : (
              <>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Added to or taken off one person&apos;s pay for {formatMonth(month)}. The sheet updates straight away.
                </p>
                <details className="group mt-4 rounded-xl border border-border bg-secondary/40">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    <Plus className="size-4 text-brand transition-transform group-open:rotate-45" aria-hidden />
                    Add bonus or advance
                  </summary>
                  <div className="border-t border-border p-4">
                    <AdjustmentForm month={month} people={sheet.rows.map((r) => ({ id: r.employeeId, label: `${r.name} (${r.empCode})` }))} />
                  </div>
                </details>
              </>
            )}
            {sheet.adjustments.length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                No bonuses or advances for this month.{locked ? "" : " Use the button above to add one."}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {sheet.adjustments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{a.name}</span>
                      <span className="block text-muted-foreground sm:inline">
                        <span className="hidden sm:inline"> · </span>
                        {ADJUSTMENT_LABELS[a.type]} {taka(a.amount)}
                        {a.note ? ` · ${a.note}` : ""}
                      </span>
                    </span>
                    {locked ? null : <RemoveAdjustmentForm id={a.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {runs.length > 0 ? (
        <Card>
          <CardTitle count={runs.length}>All payroll runs</CardTitle>
          <ul className="mt-3 divide-y divide-border text-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/payroll?month=${run.month}`} className="font-medium text-brand underline-offset-4 hover:underline">
                  {formatMonth(run.month)}
                </Link>
                <span className="text-muted-foreground">
                  {run.status === "finalized" ? "Finalized" : "Draft"} · {run.employees} {run.employees === 1 ? "person" : "people"} · net {taka(run.net)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
