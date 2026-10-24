import {
  AlarmClock,
  Banknote,
  CalendarCheck,
  CalendarOff,
  ChartColumn,
  Download,
  Medal,
  Plane,
  TriangleAlert,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { DailyBars } from "@/components/charts/daily-bars";
import { MonthNav } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Ring } from "@/components/ui/ring";
import { StatTile } from "@/components/ui/stat-tile";
import type { Tone } from "@/components/ui/tone";
import { getDb } from "@/db";
import { loadMonthGrid } from "@/lib/attendance/month";
import { listPayrollRuns, loadPayrollSheet } from "@/lib/payroll/runs";
import { buildAttendanceReport, formatRate, type PersonFigure } from "@/lib/reports/attendance-report";
import { formatCompact, formatTaka, payrollByDepartment, payrollTrend } from "@/lib/reports/payroll-report";
import { requireRole } from "@/lib/session";
import { formatMonth, isValidMonth, toOfficeDate, toOfficeMonth } from "@/lib/time";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage(props: PageProps<"/reports">) {
  return (
    <>
      <PageHeader
        icon={ChartColumn}
        title="Reports"
        description="The month in numbers: attendance, lateness, leave and what the payroll costs."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading reports</p>}>
        <ReportsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function rateTone(rate: number | null): Tone {
  if (rate === null) return "off";
  return rate >= 0.95 ? "success" : rate >= 0.85 ? "warning" : "danger";
}

function PeopleCard({
  icon,
  title,
  empty,
  people,
  detail,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  empty: string;
  people: readonly PersonFigure[];
  detail: (person: PersonFigure) => string;
  tone: Tone;
}) {
  return (
    <Card>
      <CardTitle icon={icon}>{title}</CardTitle>
      {people.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {people.map((person) => (
            <li key={person.employeeId} className="flex items-center gap-3 py-2.5">
              <Avatar name={person.name} className="size-9 text-xs" />
              <div className="min-w-0 flex-1">
                <Link href={`/employees/${person.employeeId}`} className="block truncate text-sm font-medium hover:underline">
                  {person.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  Code {person.empCode}
                  {person.department ? `, ${person.department}` : ""}
                </p>
              </div>
              <Badge tone={tone}>{detail(person)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Reads the current time and the database, so it renders after the session check, inside Suspense. */
async function ReportsContent({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  await requireRole("owner", "hr");

  const now = new Date();
  const today = toOfficeDate(now);
  const thisMonth = toOfficeMonth(now);
  const { month: requested } = await searchParams;
  const month = typeof requested === "string" && isValidMonth(requested) ? requested : thisMonth;

  const db = getDb();
  const [grid, runs, sheet] = await Promise.all([loadMonthGrid(db, month, today), listPayrollRuns(db), loadPayrollSheet(db, month)]);
  const report = buildAttendanceReport(grid);
  const { totals } = report;
  const leaveDays = totals.leavePaid + totals.leaveUnpaid;

  const nav = (
    <MonthNav basePath="/reports" month={month} thisMonth={thisMonth}>
      <a href={`/reports/export?month=${month}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Download aria-hidden />
        Download CSV
      </a>
    </MonthNav>
  );

  if (report.people === 0) {
    return (
      <div className="mt-6 grid gap-5">
        {nav}
        <Card className="border-dashed text-sm text-muted-foreground shadow-none">
          Nobody was employed in {formatMonth(month)}.{" "}
          <Link href="/employees" className="font-medium text-primary underline underline-offset-2">
            Add employees on the Employees screen
          </Link>
          , or pick another month.
        </Card>
      </div>
    );
  }

  const trend = payrollTrend(runs, month);
  const departmentCosts = sheet ? payrollByDepartment(sheet.rows) : [];
  const departmentMax = Math.max(1, ...departmentCosts.map((d) => d.net));
  const checks = [
    { count: totals.missingOut, text: "with no leaving punch" },
    { count: totals.workedOffDays, text: "worked on a day off" },
    { count: totals.correctedByHand, text: "corrected by hand" },
  ];

  return (
    <div className="mt-6 grid gap-5">
      {nav}

      <div className="grid gap-3 md:grid-cols-[18rem_1fr] md:gap-5">
        <section className="flex items-center gap-5 rounded-3xl bg-forest p-5 text-forest-foreground shadow-card">
          <Ring
            size={116}
            thickness={13}
            track="stroke-forest-line"
            segments={[
              { value: totals.present - totals.late, tone: "success", label: "On time" },
              { value: totals.late, tone: "warning", label: "Late" },
              { value: totals.absent, tone: "danger", label: "Absent" },
            ]}
          >
            <p className="text-2xl font-semibold tabular-nums">{formatRate(report.attendanceRate)}</p>
          </Ring>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">Attendance rate</p>
            <p className="mt-1 text-sm text-forest-foreground/80">
              {plural(totals.present, "day")} attended, {plural(totals.absent, "day")} absent
              {report.workingDays > 0 ? `, over ${plural(report.workingDays, "working day")}` : ""}.
            </p>
          </div>
        </section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="On time"
            value={formatRate(report.punctualityRate)}
            icon={CalendarCheck}
            tone={rateTone(report.punctualityRate)}
            hint="of arrivals"
          />
          <StatTile
            label="Late days"
            value={totals.late}
            icon={AlarmClock}
            tone="warning"
            hint={totals.lateMinutes > 0 ? `${totals.lateMinutes} min in all` : undefined}
          />
          <StatTile label="Absent days" value={totals.absent} icon={UserX} tone="danger" />
          <StatTile
            label="Leave days"
            value={leaveDays}
            icon={Plane}
            tone="info"
            hint={leaveDays > 0 ? `${totals.leavePaid} paid, ${totals.leaveUnpaid} unpaid` : undefined}
          />
        </div>
      </div>

      <Card>
        <CardTitle icon={ChartColumn}>Day by day</CardTitle>
        <p className="mb-4 mt-1.5 text-sm text-muted-foreground">
          How many people were on time, late, absent or on leave each day of {formatMonth(month)}.
        </p>
        <DailyBars points={report.daily} />
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle icon={Users} count={report.departments.length}>
            Teams
          </CardTitle>
          <p className="mb-4 mt-1.5 text-sm text-muted-foreground">Attendance rate by department.</p>
          <BarList
            max={1}
            items={report.departments.map((d) => ({
              label: d.department,
              value: d.rate ?? 0,
              display: formatRate(d.rate),
              tone: rateTone(d.rate),
              sub: `${plural(d.people, "person", "people")}, ${d.late} late, ${d.absent} absent, ${d.leave} on leave`,
            }))}
          />
        </Card>

        <Card>
          <CardTitle icon={Banknote}>Payroll cost</CardTitle>
          {sheet ? (
            <>
              <div className="mb-5 mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Gross", sheet.totals.gross, "text-foreground"],
                  ["Deductions", sheet.totals.deductions, "text-danger"],
                  ["Additions", sheet.totals.additions, "text-success"],
                  ["Net pay", sheet.totals.net, "text-foreground font-semibold"],
                ].map(([label, value, cls]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`mt-0.5 text-base tabular-nums ${cls}`}>{formatTaka(Number(value))}</p>
                  </div>
                ))}
              </div>
              <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                Run for {formatMonth(month)}
                <Badge tone={sheet.run.status === "finalized" ? "success" : "warning"}>
                  {sheet.run.status === "finalized" ? "Finalized" : "Draft"}
                </Badge>
              </p>
              <BarList
                items={departmentCosts.map((d) => ({
                  label: d.department,
                  value: d.net,
                  display: formatTaka(d.net),
                  tone: "info",
                  sub: `${plural(d.people, "person", "people")}, gross ${formatTaka(d.gross)}`,
                }))}
                max={departmentMax}
              />
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No payroll run for {formatMonth(month)} yet.{" "}
              <Link href={`/payroll?month=${month}`} className="font-medium text-primary underline underline-offset-2">
                Create the draft on the Payroll screen
              </Link>
              .
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle icon={Banknote}>Net pay, last six months</CardTitle>
        <p className="mb-4 mt-1.5 text-sm text-muted-foreground">The net pay of each payroll run. Months with no run are left empty.</p>
        {trend.some((p) => p.net !== null) ? (
          <ColumnChart
            columns={trend.map((p) => ({
              label: formatMonth(p.month).split(" ")[0],
              value: p.net,
              display: p.net === null ? undefined : formatCompact(p.net),
              highlight: p.month === month,
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No payroll runs in these months yet. Create one on the{" "}
            <Link href="/payroll" className="font-medium text-primary underline underline-offset-2">
              Payroll screen
            </Link>{" "}
            and it will show here.
          </p>
        )}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <PeopleCard
          icon={AlarmClock}
          title="Most late"
          empty="Nobody was late."
          people={report.mostLate}
          tone="warning"
          detail={(p) => `${plural(p.late, "time")}, ${p.lateMinutes} min`}
        />
        <PeopleCard
          icon={UserX}
          title="Most absent"
          empty="Nobody was absent."
          people={report.mostAbsent}
          tone="danger"
          detail={(p) => plural(p.absent, "day")}
        />
        <PeopleCard
          icon={Medal}
          title="Perfect attendance"
          empty="Nobody has a clean month yet."
          people={report.perfect.slice(0, 5)}
          tone="success"
          detail={(p) => plural(p.present, "day")}
        />
      </div>

      <Card>
        <CardTitle icon={TriangleAlert}>Worth a look</CardTitle>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {checks.map((check) => (
            <li key={check.text} className="flex items-center gap-3 rounded-xl bg-secondary px-3.5 py-3 text-sm">
              <span className="text-xl font-semibold tabular-nums">{check.count}</span>
              <span className="text-muted-foreground">
                {check.count === 1 ? "day" : "days"} {check.text}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          <CalendarOff className="mr-1.5 inline size-4 align-text-bottom" aria-hidden />
          Open{" "}
          <Link href={`/attendance?month=${month}`} className="font-medium text-primary underline underline-offset-2">
            Attendance
          </Link>{" "}
          to fix a missing punch or correct a day.
        </p>
      </Card>
    </div>
  );
}
