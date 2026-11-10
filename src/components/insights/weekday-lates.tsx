import { BarChart3 } from "lucide-react";

import { BarList } from "@/components/charts/bar-list";
import { ChartTable } from "@/components/insights/chart-table";
import { Card, CardTitle } from "@/components/ui/card";
import type { WeekdayLates } from "@/lib/insights/summary";

/** Lates on each working weekday over the last two months: a pattern shows as one longer bar. */
export function WeekdayLatesCard({ weekdays }: { weekdays: readonly WeekdayLates[] }) {
  return (
    <Card>
      <CardTitle icon={BarChart3}>Lates by weekday</CardTitle>
      <p className="mt-1 text-xs text-muted-foreground">This month and last</p>
      {weekdays.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">No lates in the last two months.</p>
      ) : (
        <div className="mt-4">
          <BarList items={weekdays.map((d) => ({ label: d.label, value: d.lates, display: String(d.lates), tone: "warning" as const }))} />
          <ChartTable caption="Lates on each working weekday" columns={["Weekday", "Lates"]} rows={weekdays.map((d) => [d.label, d.lates])} />
        </div>
      )}
    </Card>
  );
}
