import { Info } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { DateRangeFilter } from "@/components/date-range-filter";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { PeopleFilter } from "@/components/people-filter";
import { Card } from "@/components/ui/card";
import { HeroPanel } from "@/components/ui/hero-panel";
import { statusFill } from "@/components/status";
import { getDb } from "@/db";
import type { AttendanceStatus } from "@/db/schema/attendance";
import { cellText, statusLabel } from "@/lib/attendance/labels";
import { loadPeriodGrid, type GridCell } from "@/lib/attendance/month";
import { describePeriodNav, periodLabel, resolvePeriod } from "@/lib/period";
import { buildAttendanceReport } from "@/lib/reports/attendance-report";
import { requireRole } from "@/lib/session";
import { getCompanySettings } from "@/lib/settings/company";
import { formatDuration, formatMonth, toOfficeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { AttendanceCards, AttendanceLegend } from "./attendance-cards";
import { AttendanceSummary } from "./attendance-summary";
import { ExportPanel } from "./export-panel";
import { parseView, VIEW_COOKIE } from "./view";
import { ViewToggle } from "./view-toggle";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage(props: PageProps<"/attendance">) {
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Attendance for every employee over a month, three months or any dates, built from device punches. Open a day to see the punches behind it."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading attendance</p>}>
        <AttendanceContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function cellStyle(status: AttendanceStatus): string {
  // Present is the usual day, so it stays plain and the days that need a look are the ones in color.
  if (status === "present") return "text-foreground";
  return `font-semibold ${statusFill[status]}`;
}

function describeCell(date: string, cell: GridCell): string {
  const parts = [`${date}: ${statusLabel[cell.status]}`];
  if (cell.status === "late") parts.push(`${formatDuration(cell.lateMinutes)} late`);
  if (cell.missingOut) parts.push("no leaving punch");
  if (cell.workedOnOffDay) parts.push("came in on a day off");
  if (cell.isManual) parts.push("corrected by hand");
  return parts.join(", ");
}

/** Adds the search box and department list above the people when there are enough of them to need it. */
function Filterable({ showFilter, departments, children }: { showFilter: boolean; departments: string[]; children: React.ReactNode }) {
  return showFilter ? <PeopleFilter departments={departments}>{children}</PeopleFilter> : <>{children}</>;
}

/** Reads the current time and the database, so it renders after the session check, inside Suspense. */
async function AttendanceContent({ searchParams }: { searchParams: PageProps<"/attendance">["searchParams"] }) {
  await requireRole("owner", "hr");

  const now = new Date();
  const today = toOfficeDate(now);
  const { period, notice } = resolvePeriod(await searchParams, today);
  const label = periodLabel(period);

  const view = parseView((await cookies()).get(VIEW_COOKIE)?.value);

  const [grid, company] = await Promise.all([loadPeriodGrid(getDb(), period, today), getCompanySettings(getDb())]);
  const trackLeavingPunch = company.trackLeavingPunch;
  const report = buildAttendanceReport(grid);
  const departments = [...new Set(grid.rows.flatMap((row) => (row.employee.department ? [row.employee.department] : [])))].sort((a, b) => a.localeCompare(b));
  const showFilter = grid.rows.length > 6;
  // Dates grouped by month, for the heading row over a long period.
  const monthSpans: { month: string; days: number }[] = [];
  for (const date of grid.dates) {
    const month = date.slice(0, 7);
    const last = monthSpans.at(-1);
    if (last?.month === month) last.days += 1;
    else monthSpans.push({ month, days: 1 });
  }

  return (
    <div className="mt-6 grid gap-5">
      <HeroPanel>
        <DateRangeFilter key={`${period.from}-${period.to}`} basePath="/attendance" nav={describePeriodNav("/attendance", period, today)}>
          <ViewToggle view={view} />
          <ExportPanel grid={grid} trackLeavingPunch={trackLeavingPunch} />
        </DateRangeFilter>
        {grid.rows.length > 0 ? (
          <div className="mt-5">
            <AttendanceSummary report={report} />
          </div>
        ) : null}
      </HeroPanel>
      {notice ? (
        <Alert tone="info" icon={Info} className="py-2">
          {notice}
        </Alert>
      ) : null}

      {grid.rows.length === 0 ? (
        <Card className="border-dashed text-sm text-muted-foreground shadow-none">
          Nobody was employed in {label}.{" "}
          <Link href="/employees" className="font-medium text-brand underline underline-offset-2">
            Add employees on the Employees screen
          </Link>
          , or pick other dates.
        </Card>
      ) : (
        <>
          <AttendanceLegend />
          <Filterable showFilter={showFilter} departments={departments}>
          <div className={cn(view === "table" && "md:hidden")}>
            <AttendanceCards grid={grid} trackLeavingPunch={trackLeavingPunch} today={today} />
          </div>
          <div className={cn("hidden max-h-[75vh] overflow-auto rounded-xl border border-border bg-card shadow-card", view === "table" && "md:block")}>
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_var(--border)]">
                {monthSpans.length > 1 ? (
                  <tr className="text-xs text-muted-foreground">
                    <th colSpan={5} className="sticky left-0 z-20 bg-card" aria-hidden />
                    {monthSpans.map((span) => (
                      <th key={span.month} colSpan={span.days} scope="colgroup" className="border-l border-border bg-secondary/50 px-2 py-1 text-left font-medium">
                        {formatMonth(span.month)}
                      </th>
                    ))}
                  </tr>
                ) : null}
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="sticky left-0 z-20 min-w-32 bg-card px-3 py-2 font-medium">
                    Employee
                  </th>
                  {["Present", "Late", "Absent", "Leave"].map((name, i) => (
                    <th key={name} scope="col" className={cn("px-1.5 py-2 text-right text-xs font-medium", i === 3 && "border-r border-border pr-2")}>
                      {name}
                    </th>
                  ))}
                  {grid.dates.map((date) => (
                    <th key={date} scope="col" className="min-w-6 px-0 py-2 text-center text-xs font-medium tabular-nums">
                      {Number(date.slice(8))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr
                    key={row.employee.id}
                    data-person={row.employee.id}
                    data-name={row.employee.name}
                    data-department={row.employee.department ?? ""}
                    className="border-b border-border bg-card last:border-b-0 even:bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))]"
                  >
                    <th scope="row" className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left font-medium">
                      {row.employee.name}
                      <span className="block text-xs font-normal text-muted-foreground">Code {row.employee.empCode}</span>
                    </th>
                    <td className="px-1.5 py-2 text-right tabular-nums">{row.totals.present}</td>
                    <td className="px-1.5 py-2 text-right tabular-nums">{row.totals.late}</td>
                    <td className="px-1.5 py-2 text-right tabular-nums">{row.totals.absent}</td>
                    <td className="border-r border-border py-2 pl-1.5 pr-2 text-right tabular-nums">{row.totals.leave}</td>
                    {grid.dates.map((date) => {
                      const cell = row.cells.get(date);
                      if (!cell) return <td key={date} className="px-0.5 py-2 text-center text-muted-foreground/40">-</td>;
                      return (
                        <td key={date} className="p-0.5 text-center">
                          <Link
                            href={`/attendance/${row.employee.id}/${date}`}
                            aria-label={describeCell(date, cell)}
                            title={describeCell(date, cell)}
                            className={cn("block rounded-md px-0.5 py-1.5 text-[11px] hover:ring-1 hover:ring-brand", cellStyle(cell.status))}
                          >
                            {cellText(cell)}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Filterable>
        </>
      )}

      <p className={cn("hidden text-xs leading-relaxed text-muted-foreground", view === "table" && "md:block")}>
        P present, L late, A absent, PL paid leave, UL unpaid leave, W weekly off day, H holiday.{" "}
        {trackLeavingPunch ? "An exclamation mark means no leaving punch, an asterisk" : "An asterisk"} means corrected by hand, a dash means no
        record for that day. Present counts late days too.
      </p>
    </div>
  );
}
