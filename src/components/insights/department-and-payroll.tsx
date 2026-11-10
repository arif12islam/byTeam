import { Building2, Wallet } from "lucide-react";
import Link from "next/link";

import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { Card, CardTitle } from "@/components/ui/card";
import type { PayrollTrend } from "@/lib/insights/summary";
import { formatRate, type DepartmentRow } from "@/lib/reports/attendance-report";
import { formatTaka as taka } from "@/lib/salary/money";

/** Attendance by department, shown only when there are two or more to compare. */
export function DepartmentCard({ rows }: { rows: readonly DepartmentRow[] }) {
  return (
    <Card>
      <CardTitle icon={Building2}>Departments</CardTitle>
      <p className="mt-1 text-xs text-muted-foreground">Attendance so far this month</p>
      <div className="mt-4">
        <BarList
          items={rows.map((d) => ({
            label: d.department,
            sub: `${d.people} ${d.people === 1 ? "person" : "people"}, ${d.late} late, ${d.absent} absent`,
            value: d.rate ?? 0,
            display: formatRate(d.rate),
            brand: true,
          }))}
          max={1}
        />
      </div>
    </Card>
  );
}

/** Net pay of the latest payroll runs side by side, with the change in the newest. */
export function PayrollCard({ trend }: { trend: PayrollTrend }) {
  const newest = trend.months.at(-1);
  return (
    <Card>
      <CardTitle
        icon={Wallet}
        action={
          <Link href={newest ? `/payroll?month=${newest.month}` : "/payroll"} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Open payroll
          </Link>
        }
      >
        Net pay by month
      </CardTitle>
      {trend.months.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">The trend shows after two payroll runs.</p>
      ) : (
        <div className="mt-4">
          <ColumnChart columns={trend.months.map((m, i) => ({ label: m.label, value: m.net, display: taka(String(m.net)), highlight: i === trend.months.length - 1 }))} />
          {trend.changePercent !== null ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {Math.abs(Math.round(trend.changePercent))}% {trend.changePercent >= 0 ? "higher" : "lower"} than the month before.
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
