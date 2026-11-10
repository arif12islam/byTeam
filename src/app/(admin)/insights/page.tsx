import type { Metadata } from "next";
import { Suspense } from "react";

import { DailyCard } from "@/components/insights/daily-card";
import { DeviceHealthCard } from "@/components/insights/device-health";
import { DepartmentCard, PayrollCard } from "@/components/insights/department-and-payroll";
import { HeadlineTiles } from "@/components/insights/headline-tiles";
import { InsightsSkeleton } from "@/components/insights/insights-skeleton";
import { LeaveLowCard } from "@/components/insights/leave-low";
import { PeopleLists } from "@/components/insights/people-lists";
import { WeekdayLatesCard } from "@/components/insights/weekday-lates";
import { WorthALook } from "@/components/insights/worth-a-look";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { getInsights } from "@/lib/insights/load";
import { requireRole } from "@/lib/session";
import { formatOfficeDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        title="Insights"
        description="This month at a glance, and the facts worth a look, worked out from attendance, leave, payroll and the device. Updated about every five minutes."
      />
      <Suspense fallback={<InsightsSkeleton />}>
        <InsightsContent />
      </Suspense>
    </>
  );
}

async function InsightsContent() {
  await requireRole("owner", "hr");
  const { insights, summary, madeAt, leftOut } = await getInsights(getDb());

  return (
    <div className="mt-6 grid max-w-5xl gap-5">
      <HeadlineTiles headline={summary.headline} />
      <WorthALook facts={insights.facts} />
      <DailyCard points={summary.daily} month={summary.month} />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <WeekdayLatesCard weekdays={summary.weekdays} />
        <PeopleLists onTime={summary.people.onTime} needsLook={summary.people.needsLook} />
        <LeaveLowCard rows={summary.leaveLow} />
        <DeviceHealthCard devices={summary.devices.devices} unknownCodes={summary.devices.unknownCodes} />
        {summary.departments ? <DepartmentCard rows={summary.departments} /> : null}
        <PayrollCard trend={summary.payroll} />
      </div>

      {leftOut.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Left out of Insights: {leftOut.map((p) => p.name).join(", ")}. Change this on each employee&apos;s page.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Worked out {formatOfficeDateTime(madeAt)}.</p>
    </div>
  );
}
