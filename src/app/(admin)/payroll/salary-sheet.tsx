import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { SheetRow } from "@/lib/payroll/runs";
import { formatTakaSigned as taka } from "@/lib/salary/money";
import { cn } from "@/lib/utils";

type Totals = { gross: string; deductions: string; additions: string; net: string };

const cell = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";
const head = "bg-card px-3 py-2.5 text-right text-xs font-medium text-muted-foreground whitespace-nowrap";

/** A payslip exists only once the month is finalized, so drafts have no link. */
export function payslipHref(month: string, employeeId: string): string {
  return `/payroll/payslip/view?month=${month}&employee=${employeeId}`;
}

/** The salary sheet: a table on wide screens, one card per person on phones. */
export function SalarySheet({ rows, totals, month, locked }: { rows: readonly SheetRow[]; totals: Totals; month: string; locked: boolean }) {
  return (
    <>
      <section aria-label="Salary sheet" className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row.employeeId} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Avatar name={row.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{row.name}</p>
                <p className="text-xs text-muted-foreground">Code {row.empCode}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold leading-none tracking-tight tabular-nums">{taka(row.net)}</p>
                <p className="mt-1 text-xs text-muted-foreground">net pay</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
              {[
                ["Gross", row.gross],
                ["Deductions", row.deductions],
                ["Additions", row.additions],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{taka(value)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge tone="off">{row.payableDays} days paid</Badge>
              {row.absentDays > 0 ? <Badge tone="danger">{row.absentDays} absent</Badge> : null}
              {row.lateCount > 0 ? <Badge tone="warning">{row.lateCount} late</Badge> : null}
              {row.unpaidLeaveDays > 0 ? <Badge tone="info">{row.unpaidLeaveDays} unpaid leave</Badge> : null}
              {locked ? (
                <Link href={payslipHref(month, row.employeeId)} className="ml-auto inline-flex h-10 items-center text-sm font-medium text-brand underline-offset-4 hover:underline">
                  Payslip
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Salary sheet" className="hidden max-h-[75vh] overflow-auto rounded-xl border border-border bg-card shadow-card md:block">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead className="sticky top-0 z-20 shadow-[0_1px_0_var(--border)]">
            <tr>
              <th scope="col" className="sticky left-0 z-20 bg-card px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
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
              <th scope="col" className={head}>
                <span className="sr-only">Payslip</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const zebra = i % 2 === 1;
              return (
                <tr key={row.employeeId} className={cn("group", zebra && "bg-muted/40")}>
                  <th scope="row" className={cn("sticky left-0 z-10 px-3 py-2.5 text-left font-medium whitespace-nowrap", zebra ? "bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]" : "bg-card")}>
                    {row.name}
                    <span className="block text-xs font-normal text-muted-foreground">{row.empCode}</span>
                  </th>
                  <td className={cell}>{row.payableDays}</td>
                  <td className={cn(cell, row.absentDays === 0 && "text-muted-foreground")}>{row.absentDays}</td>
                  <td className={cn(cell, row.lateCount === 0 && "text-muted-foreground")}>{row.lateCount}</td>
                  <td className={cn(cell, row.unpaidLeaveDays === 0 && "text-muted-foreground")}>{row.unpaidLeaveDays}</td>
                  <td className={cell}>{taka(row.gross)}</td>
                  <td className={cell}>{taka(row.deductions)}</td>
                  <td className={cell}>{taka(row.additions)}</td>
                  <td className={cn(cell, "font-semibold")}>{taka(row.net)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {locked ? (
                      <Link
                        href={payslipHref(month, row.employeeId)}
                        className="text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:underline md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      >
                        Payslip
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className="sticky left-0 z-10 border-t border-border bg-secondary px-3 py-2.5 text-left">
                Total
              </th>
              <td className={cn(cell, "border-t border-border bg-secondary")} colSpan={4} />
              <td className={cn(cell, "border-t border-border bg-secondary")}>{taka(totals.gross)}</td>
              <td className={cn(cell, "border-t border-border bg-secondary")}>{taka(totals.deductions)}</td>
              <td className={cn(cell, "border-t border-border bg-secondary")}>{taka(totals.additions)}</td>
              <td className={cn(cell, "border-t border-border bg-secondary")}>{taka(totals.net)}</td>
              <td className="border-t border-border bg-secondary" />
            </tr>
          </tfoot>
        </table>
      </section>
    </>
  );
}
