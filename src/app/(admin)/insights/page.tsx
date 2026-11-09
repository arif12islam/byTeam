import type { Metadata } from "next";
import { Suspense } from "react";

import { FactList } from "@/components/insights/fact-list";
import { PageHeader } from "@/components/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { CATEGORY_LABELS } from "@/lib/insights/facts";
import { getInsights } from "@/lib/insights/load";
import { requireRole } from "@/lib/session";
import { formatOfficeDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        title="Insights"
        description="Facts worked out from this month's attendance, leave and payroll and from the device. They are updated about every five minutes."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Working out the facts</p>}>
        <InsightsContent />
      </Suspense>
    </>
  );
}

async function InsightsContent() {
  await requireRole("owner", "hr");
  const { insights, madeAt, leftOut } = await getInsights(getDb());

  return (
    <div className="mt-6 grid max-w-3xl gap-5">
      {insights.byCategory.length === 0 ? (
        <Card className="border-dashed text-sm text-muted-foreground shadow-none">
          Nothing unusual so far. Facts appear as the month builds up, for example when lates go up, someone forgets to punch out, or the device goes quiet.
        </Card>
      ) : (
        insights.byCategory.map((group) => (
          <Card key={group.category}>
            <CardTitle count={group.facts.length}>{CATEGORY_LABELS[group.category]}</CardTitle>
            <FactList facts={group.facts} className="mt-1" />
          </Card>
        ))
      )}
      {leftOut.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Left out of Insights: {leftOut.map((p) => p.name).join(", ")}. Change this on each employee&apos;s page.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Worked out {formatOfficeDateTime(madeAt)}.</p>
    </div>
  );
}
