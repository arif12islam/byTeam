import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { MonthNav } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { ADJUSTMENT_LABELS } from "@/lib/payroll/adjustments";
import { listPayrollRuns, loadPayrollSheet } from "@/lib/payroll/runs";
import { formatTakaSigned as taka } from "@/lib/salary/money";
import { requireRole } from "@/lib/session";
import { formatMonth, formatOfficeDate, isValidMonth, toOfficeDate, toOfficeMonth } from "@/lib/time";

import { AdjustmentForm, CreateRunForm, FinalizeForm, RecomputeForm, RemoveAdjustmentForm, UnlockForm } from "./run-forms";

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

const cell = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
const head = "px-3 py-2 text-right text-xs font-medium text-muted-foreground whitespace-nowrap";

async function PayrollContent({ searchParams }: { searchParams: PageProps<"/payroll">["searchParams"] }) {
  const user = await requireRole("owner", "hr");

  const thisMonth = toOfficeMonth(new Date());
  const { month: requested } = await searchParams;
  const month = typeof requested === "string" && isValidMonth(requested) ? requested : thisMonth;

  const db = getDb();
  const [sheet, runs] = await Promise.all([loadPayrollSheet(db, month), listPayrollRuns(db)]);
  const locked = sheet?.run.status === "finalized";

  return (
    <div className="mt-6 grid gap-6">
      <MonthNav basePath="/payroll" month={month} thisMonth={thisMonth} />

      {sheet === null ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="text-base font-semibold">No payroll run for {formatMonth(month)} yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A draft works out everyone&apos;s pay from attendance, leave and the pay rules. You can review it, add bonuses and advances and
            recompute as often as you like before it is finalized.
          </p>
          <div className="mt-5">
            <CreateRunForm month={month} label={formatMonth(month)} />
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-5 shadow-card sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  Net pay for {formatMonth(month)}
                  <Badge tone={locked ? "success" : "warning"}>{locked ? "Finalized" : "Draft"}</Badge>
                </p>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{taka(sheet.totals.net)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {locked
                    ? `Version ${sheet.run.version}${
                        sheet.run.finalizedAt
                          ? `, finalized ${formatOfficeDate(toOfficeDate(sheet.run.finalizedAt))}${sheet.run.finalizedByName ? ` by ${sheet.run.finalizedByName}` : ""}`
                          : ""
                      }`
                    : "Not final until the owner finalizes it."}
                </p>
              </div>
              {locked ? null : <RecomputeForm runId={sheet.run.id} />}
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
              {[
                ["Gross", sheet.totals.gross],
                ["Deductions", sheet.totals.deductions],
                ["Additions", sheet.totals.additions],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{taka(value)}</dd>
                </div>
              ))}
            </dl>
          </section>

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
                  <Link href={`/employees/${s.employeeId}`} className="text-primary underline-offset-4 hover:underline">
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
            <>
              <section aria-label="Salary sheet" className="grid gap-3 md:hidden">
                {sheet.rows.map((row) => (
                  <div key={row.employeeId} className="rounded-xl border border-border bg-card p-4 shadow-card">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{row.name}</p>
                        <p className="text-xs text-muted-foreground">Code {row.empCode}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold leading-none tabular-nums">{taka(row.net)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">net pay</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                      Gross {taka(row.gross)}, deductions {taka(row.deductions)}, additions {taka(row.additions)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone="off">{row.payableDays} days paid</Badge>
                      {row.absentDays > 0 ? <Badge tone="danger">{row.absentDays} absent</Badge> : null}
                      {row.lateCount > 0 ? <Badge tone="warning">{row.lateCount} late</Badge> : null}
                      {row.unpaidLeaveDays > 0 ? <Badge tone="info">{row.unpaidLeaveDays} unpaid leave</Badge> : null}
                    </div>
                  </div>
                ))}
              </section>
              <section aria-label="Salary sheet" className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-card md:block">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Employee
                      </th>
                      <th scope="col" className={head}>Days paid</th>
                      <th scope="col" className={head}>Absent</th>
                      <th scope="col" className={head}>Late</th>
                      <th scope="col" className={head}>Unpaid leave</th>
                      <th scope="col" className={head}>Gross</th>
                      <th scope="col" className={head}>Deductions</th>
                      <th scope="col" className={head}>Additions</th>
                      <th scope="col" className={head}>Net pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.map((row) => (
                      <tr key={row.employeeId} className="border-b border-border last:border-0">
                        <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {row.name}
                          <span className="block text-xs font-normal text-muted-foreground">{row.empCode}</span>
                        </th>
                        <td className={cell}>{row.payableDays}</td>
                        <td className={cell}>{row.absentDays}</td>
                        <td className={cell}>{row.lateCount}</td>
                        <td className={cell}>{row.unpaidLeaveDays}</td>
                        <td className={cell}>{taka(row.gross)}</td>
                        <td className={cell}>{taka(row.deductions)}</td>
                        <td className={cell}>{taka(row.additions)}</td>
                        <td className={`${cell} font-semibold`}>{taka(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/50 font-semibold">
                      <th scope="row" className="px-3 py-2 text-left">Total</th>
                      <td className={cell} colSpan={4} />
                      <td className={cell}>{taka(sheet.totals.gross)}</td>
                      <td className={cell}>{taka(sheet.totals.deductions)}</td>
                      <td className={cell}>{taka(sheet.totals.additions)}</td>
                      <td className={cell}>{taka(sheet.totals.net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            </>
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

          {locked ? (
            <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
              <p role="status" className="text-sm">
                Attendance, leave, bonuses and advances for {formatMonth(month)} are locked.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`/payroll/payslip?month=${month}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Download all payslips (PDF)
                </a>
                <a href={`/payroll/export?month=${month}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Download salary sheet (Excel)
                </a>
              </div>
              {user.role === "owner" ? (
                <div className="mt-4">
                  <h2 className="text-base font-semibold">Need to change something?</h2>
                  <p className="mt-1 mb-4 text-sm text-muted-foreground">
                    Unlocking takes the month back to a draft. Fix what is wrong, recompute the sheet, then finalize again.
                  </p>
                  <UnlockForm runId={sheet.run.id} label={formatMonth(month)} />
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Only the owner can unlock a month.</p>
              )}
            </section>
          ) : sheet.rows.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
              <h2 className="text-base font-semibold">Finalize payroll</h2>
              {user.role === "owner" ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Check the sheet and the breakdowns first. Finalizing recalculates once more, keeps a copy of the pay rules, and locks the month.
                  </p>
                  <div className="mt-5">
                    <FinalizeForm runId={sheet.run.id} label={formatMonth(month)} />
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Only the owner can finalize a month. Ask them to review this sheet.</p>
              )}
            </section>
          ) : null}

          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="text-base font-semibold">Bonuses and advances</h2>
            {locked ? (
              <p className="mt-1 text-sm text-muted-foreground">This month is finalized, so amounts cannot be changed.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Added to or taken off one person&apos;s pay for {formatMonth(month)}. The sheet updates straight away.
                </p>
                <div className="mt-5">
                  <AdjustmentForm month={month} people={sheet.rows.map((r) => ({ id: r.employeeId, label: `${r.name} (${r.empCode})` }))} />
                </div>
              </>
            )}
            {sheet.adjustments.length === 0 ? (
              <p className="mt-5 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                No bonuses or advances for this month.
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-border">
                {sheet.adjustments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      <span className="font-medium">{a.name}</span> · {ADJUSTMENT_LABELS[a.type]} {taka(a.amount)}
                      {a.note ? <span className="text-muted-foreground"> · {a.note}</span> : null}
                    </span>
                    {locked ? null : <RemoveAdjustmentForm id={a.id} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {runs.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="text-base font-semibold">All payroll runs</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/payroll?month=${run.month}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {formatMonth(run.month)}
                </Link>
                <span className="text-muted-foreground">
                  {run.status === "finalized" ? "Finalized" : "Draft"} · {run.employees} {run.employees === 1 ? "person" : "people"} · net {taka(run.net)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
