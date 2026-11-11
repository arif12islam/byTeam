import { HeroStat } from "@/components/ui/hero-stat";
import { Ring } from "@/components/ui/ring";
import type { AttendanceReport } from "@/lib/reports/attendance-report";
import { formatRate } from "@/lib/reports/attendance-report";
import { formatDuration } from "@/lib/time";

/**
 * The period in five numbers: the attendance rate with a small ring, then
 * present days, late, absent and leave. Everything comes from the report that
 * `buildAttendanceReport` already worked out. `compact` leaves out the rate,
 * for the narrow one-person page.
 */
export function AttendanceSummary({ report, compact = false }: { report: AttendanceReport; compact?: boolean }) {
  const { totals } = report;
  const leave = totals.leavePaid + totals.leaveUnpaid;
  return (
    <div className={compact ? "grid grid-cols-2 gap-3 sm:grid-cols-4" : "grid grid-cols-2 gap-3 md:grid-cols-5"}>
      {compact ? null : (
        <div className="col-span-2 flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3.5 py-3 md:col-span-1">
          <Ring
            size={64}
            thickness={8}
            segments={[
              { value: totals.present, tone: "success", label: "Attended" },
              { value: totals.absent, tone: "danger", label: "Absent" },
            ]}
          >
            <span className="text-sm font-semibold tabular-nums">{formatRate(report.attendanceRate)}</span>
          </Ring>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Attendance rate</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Leave does not count against it</p>
          </div>
        </div>
      )}
      <HeroStat label="Present days" value={totals.present} tone="success" hint="Late days included" />
      <HeroStat label="Late" value={totals.late} tone="warning" hint={totals.late > 0 ? `${formatDuration(totals.lateMinutes)} in total` : "Nobody late"} />
      <HeroStat label="Absent" value={totals.absent} tone="danger" hint="Days" />
      <HeroStat label="On leave" value={leave} tone="info" hint="Days" />
    </div>
  );
}
