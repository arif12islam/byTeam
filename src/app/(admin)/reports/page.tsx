import {
  AlarmClock,
  Info,
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
import { accentCycle } from "@/components/accent";
import { DateRangeFilter } from "@/components/date-range-filter";
import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Ring } from "@/components/ui/ring";
import { StatTile } from "@/components/ui/stat-tile";
import type { Tone } from "@/components/ui/tone";
import { getDb } from "@/db";
import { loadPeriodGrid } from "@/lib/attendance/month";
import { describePeriodNav, periodLabel, periodMonths, periodQuery, resolvePeriod, wholeMonthsIn } from "@/lib/period";
import { listPayrollRuns, loadPayrollSheet } from "@/lib/payroll/runs";
import { buildAttendanceReport, formatRate, type PersonFigure } from "@/lib/reports/attendance-report";
import { combineSheets, formatCompact, formatTaka, payrollByDepartment, payrollTrend, payrollTrendFor } from "@/lib/reports/payroll-report";
import { requireRole } from "@/lib/session";
import { formatMonth, toOfficeDate } from "@/lib/time";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage(props: PageProps<"/reports">) {
  return (
    <>
      <PageHeader
        icon={ChartColumn}
        accent="teal"
        title="Reports"
        description="Attendance, lateness, leave and payroll cost for a month, three months or any dates you pick."
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
      <CardTitle icon={icon} accent={tone === "warning" ? "orange" : tone === "danger" ? "pink" : "lime"}>
        {title}
      </CardTitle>
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
  const params = await searchParams;
  const { period, notice } = resolvePeriod(params, today);
  const label = periodLabel(period);
  const months = periodMonths(period);
  const payMonths = wholeMonthsIn(period);
  const single = months.length === 1;

  const db = getDb();
  const [grid, runs, sheets] = await Promise.all([
    loadPeriodGrid(db, period, today),
    listPayrollRuns(db),
    Promise.all(payMonths.map((m) => loadPayrollSheet(db, m))),
  ]);
  const payrollSheets = sheets.filter((s): s is NonNullable<typeof s> => s !== null);
  const combined = combineSheets(payrollSheets);
  const report = buildAttendanceReport(grid);
  const { totals } = report;
  const leaveDays = totals.leavePaid + totals.leaveUnpaid;

  const nav = (
    <>
      <DateRangeFilter key={`${period.from}-${period.to}`} basePath="/reports" nav={describePeriodNav("/reports", period, today)}>
        <a href={`/reports/export?${periodQuery(period)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download aria-hidden />
          Download CSV
        </a>
      </DateRangeFilter>
      {notice ? (
        <Alert tone="info" icon={Info} className="py-2">
          {notice}
        </Alert>
      ) : null}
    </>
  );

  if (report.people === 0) {
    return (
      <div className="mt-6 grid gap-5">
        {nav}
        <Card className="border-dashed text-sm text-muted-foreground shadow-none">
          Nobody was employed in {label}.{" "}
          <Link href="/employees" className="font-medium text-primary underline underline-offset-2">
            Add employees on the Employees screen
          </Link>
          , or pick other dates.
        </Card>
      </div>
    );
  }

  // One month shows the six months up to it. A longer period shows exactly its own months.
  const trend = single ? payrollTrend(runs, months[0]) : payrollTrendFor(runs, months);
  const departmentCosts = payrollByDepartment(combined.rows);
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
        <section className="relative flex items-center gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-cyan-600 to-sky-700 p-5 text-white shadow-card">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-lime-300/35 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-12 -left-8 size-32 rounded-full bg-indigo-300/35 blur-3xl" />
          <Ring
            size={116}
            thickness={13}
            track="stroke-white/25"
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
            <p className="mt-1 text-sm text-white/90">
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
        <CardTitle icon={ChartColumn} accent="indigo">Day by day</CardTitle>
        <p className="mb-4 mt-1.5 text-sm text-muted-foreground">
          How many people were on time, late, absent or on leave each day of {label}.
        </p>
        <DailyBars points={report.daily} />
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle icon={Users} accent="pink" count={report.departments.length}>
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
          <CardTitle icon={Banknote} accent="orange">Payroll cost</CardTitle>
          {combined.months > 0 ? (
            <>
              <div className="mb-5 mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Gross", combined.totals.gross, "text-foreground"],
                  ["Deductions", combined.totals.deductions, "text-danger"],
                  ["Additions", combined.totals.additions, "text-success"],
                  ["Net pay", combined.totals.net, "text-foreground font-semibold"],
                ].map(([name, value, cls]) => (
                  <div key={name}>
                    <p className="text-xs text-muted-foreground">{name}</p>
                    <p className={`mt-0.5 text-base tabular-nums ${cls}`}>{formatTaka(Number(value))}</p>
                  </div>
                ))}
              </div>
              <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {combined.months === 1 ? `Run for ${formatMonth(payMonths[0])}` : `${combined.months} monthly runs`}
                {combined.finalized > 0 ? <Badge tone="success">{combined.finalized === 1 && combined.months === 1 ? "Finalized" : `${combined.finalized} finalized`}</Badge> : null}
                {combined.drafts > 0 ? <Badge tone="warning">{combined.drafts === 1 && combined.months === 1 ? "Draft" : `${combined.drafts} draft`}</Badge> : null}
              </p>
              <BarList
                items={departmentCosts.map((d, i) => ({
                  label: d.department,
                  value: d.net,
                  display: formatTaka(d.net),
                  accent: accentCycle[i % accentCycle.length],
                  sub: `${plural(d.people, "person", "people")}, gross ${formatTaka(d.gross)}`,
                }))}
                max={departmentMax}
              />
              {combined.months < payMonths.length ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {payMonths.length - combined.months} of the {payMonths.length} months have no payroll run yet.
                </p>
              ) : null}
            </>
          ) : payMonths.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Payroll is worked out for whole months. Pick a range that covers at least one whole month to see its cost here.
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No payroll run for {payMonths.length === 1 ? formatMonth(payMonths[0]) : "these months"} yet.{" "}
              <Link href={`/payroll?month=${payMonths[0]}`} className="font-medium text-primary underline underline-offset-2">
                Create the draft on the Payroll screen
              </Link>
              .
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle icon={Banknote} accent="orange">{single ? "Net pay, last six months" : "Net pay by month"}</CardTitle>
        <p className="mb-4 mt-1.5 text-sm text-muted-foreground">The net pay of each payroll run. Months with no run are left empty.</p>
        {trend.some((p) => p.net !== null) ? (
          <ColumnChart
            accent="orange"
            columns={trend.map((p) => ({
              label: formatMonth(p.month).split(" ")[0],
              value: p.net,
              display: p.net === null ? undefined : formatCompact(p.net),
              highlight: single ? p.month === months[0] : true,
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
        <CardTitle icon={TriangleAlert} accent="slate">Worth a look</CardTitle>
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
          <Link href={`/attendance?${periodQuery(period)}`} className="font-medium text-primary underline underline-offset-2">
            Attendance
          </Link>{" "}
          to fix a missing punch or correct a day.
        </p>
      </Card>
    </div>
  );
}
