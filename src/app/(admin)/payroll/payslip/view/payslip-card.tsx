import type { Payslip } from "@/lib/payroll/payslip";
import { formatTakaSigned as taka } from "@/lib/salary/money";
import { formatMonth, formatOfficeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/** One person's payslip as a clean card. Brand shows only in the header line. Prints without chrome. */
export function PayslipCard({ slip, className }: { slip: Payslip; className?: string }) {
  const { employee, days } = slip;
  const facts: [string, string][] = [
    ["Employee code", employee.empCode],
    ...(employee.department ? ([["Department", employee.department]] as [string, string][]) : []),
    ...(employee.designation ? ([["Designation", employee.designation]] as [string, string][]) : []),
    ["Days in month", String(days.inMonth)],
    ["Days paid", String(days.paid)],
    ["Absent", String(days.absent)],
    ["Late", String(days.late)],
    ["Unpaid leave", String(days.unpaidLeave)],
  ];
  return (
    <article
      aria-label={`Payslip for ${employee.name}, ${formatMonth(slip.month)}`}
      className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-card print:rounded-none print:border-0 print:shadow-none", className)}
    >
      <header className="border-b-2 border-brand px-5 py-4 sm:px-7">
        <p className="text-sm font-semibold text-brand-soft-foreground">{slip.company || "Payslip"}</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">Payslip for {formatMonth(slip.month)}</h1>
      </header>
      <div className="px-5 py-5 sm:px-7">
        <p className="text-lg font-semibold">{employee.name}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <table className="mt-6 w-full border-collapse text-sm">
          <caption className="sr-only">How the net pay was worked out</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-2 text-left font-medium">Item</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {slip.lines.map((line) => (
              <tr key={line.code} className="border-b border-border">
                <td className="py-2.5 pr-4">{line.label}</td>
                <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                  {line.sign === "-" ? "-" : ""}
                  {taka(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-4 text-left text-base font-semibold">Net pay</th>
              <td className="pt-4 text-right text-xl font-semibold tabular-nums whitespace-nowrap">{taka(slip.net)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-6 text-xs text-muted-foreground">
          Net pay is rounded to a whole taka. Finalized {formatOfficeDate(slip.finalizedOn)}, version {slip.version}.
        </p>
      </div>
    </article>
  );
}
