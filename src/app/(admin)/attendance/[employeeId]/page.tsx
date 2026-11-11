import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { MonthNav } from "@/components/month-nav";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { HeroPanel } from "@/components/ui/hero-panel";
import { getDb } from "@/db";
import { loadPeriodGrid } from "@/lib/attendance/month";
import { monthPeriod } from "@/lib/period";
import { buildAttendanceReport } from "@/lib/reports/attendance-report";
import { requireRole } from "@/lib/session";
import { getCompanySettings } from "@/lib/settings/company";
import { formatMonth, isValidMonth, toOfficeDate, toOfficeMonth } from "@/lib/time";

import { AttendanceCards, AttendanceLegend } from "../attendance-cards";
import { AttendanceSummary } from "../attendance-summary";

export const metadata: Metadata = { title: "Attendance for one person" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PersonAttendancePage(props: PageProps<"/attendance/[employeeId]">) {
  return (
    <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading attendance</p>}>
      <PersonContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

/** One person's month as a calendar. Reads the time and the database, so it renders inside Suspense. */
async function PersonContent({
  params,
  searchParams,
}: {
  params: PageProps<"/attendance/[employeeId]">["params"];
  searchParams: PageProps<"/attendance/[employeeId]">["searchParams"];
}) {
  await requireRole("owner", "hr");

  const { employeeId } = await params;
  if (!UUID.test(employeeId)) notFound();

  const today = toOfficeDate(new Date());
  const thisMonth = toOfficeMonth(new Date());
  const { month: requested } = await searchParams;
  const month = typeof requested === "string" && isValidMonth(requested) ? requested : thisMonth;

  const db = getDb();
  const [grid, company] = await Promise.all([
    loadPeriodGrid(db, monthPeriod(month), today, { employeeIds: [employeeId] }),
    getCompanySettings(db),
  ]);
  const row = grid.rows[0];
  if (!row) notFound();

  const { employee } = row;
  return (
    <>
      <BackLink href={`/attendance?month=${month}`}>Back to attendance</BackLink>
      <PageHeader
        avatar={employee.name}
        title={employee.name}
        description={`${formatMonth(month)}. Code ${employee.empCode}${employee.department ? `, ${employee.department}` : ""}. Tap a day to see the punches behind it.`}
        actions={
          <Link href={`/employees/${employee.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open profile
          </Link>
        }
      />
      <div className="mt-6 grid max-w-xl gap-4">
        <HeroPanel>
          <MonthNav basePath={`/attendance/${employee.id}`} month={month} thisMonth={thisMonth} />
          <div className="mt-5">
            <AttendanceSummary report={buildAttendanceReport(grid)} compact />
          </div>
        </HeroPanel>
        <AttendanceLegend />
        <AttendanceCards grid={grid} trackLeavingPunch={company.trackLeavingPunch} dayQuery="?from=person" today={today} />
      </div>
    </>
  );
}
