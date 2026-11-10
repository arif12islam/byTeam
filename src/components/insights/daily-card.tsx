import { CalendarDays } from "lucide-react";

import { ChartTable } from "@/components/insights/chart-table";
import { DailyBars } from "@/components/charts/daily-bars";
import { Card, CardTitle } from "@/components/ui/card";
import type { DailyPoint } from "@/lib/reports/attendance-report";
import { formatMonth, formatOfficeDate } from "@/lib/time";

/** Each day of the month so far, stacked by what people did. */
export function DailyCard({ points, month }: { points: readonly DailyPoint[]; month: string }) {
  const working = points.filter((p) => p.kind === "working");
  return (
    <Card>
      <CardTitle icon={CalendarDays}>{formatMonth(month)}, day by day</CardTitle>
      {working.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          No working days yet this month. Bars appear after the first day.
        </p>
      ) : (
        <div className="mt-4">
          <DailyBars points={points} />
          <ChartTable
            caption={`Attendance for each working day of ${formatMonth(month)}`}
            columns={["Day", "On time", "Late", "Absent", "On leave"]}
            rows={working.map((p) => [formatOfficeDate(p.date), p.onTime, p.late, p.absent, p.leave])}
          />
        </div>
      )}
    </Card>
  );
}
