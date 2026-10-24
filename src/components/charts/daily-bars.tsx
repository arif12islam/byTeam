import type { DailyPoint } from "@/lib/reports/attendance-report";
import { cn } from "@/lib/utils";

const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * One column per day of the month, stacked by what people did: green on time,
 * amber late, red absent, blue on leave. Days off show as a short grey stub and
 * days that have not happened yet as a dotted outline. Plain HTML and CSS.
 */
export function DailyBars({ points }: { points: readonly DailyPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.onTime + p.late + p.absent + p.leave));
  const label = (p: DailyPoint) =>
    p.kind === "working"
      ? `${weekdayShort[p.weekday]} ${p.day}: ${p.onTime} on time, ${p.late} late, ${p.absent} absent, ${p.leave} on leave`
      : p.kind === "off"
        ? `${weekdayShort[p.weekday]} ${p.day}: day off`
        : `${weekdayShort[p.weekday]} ${p.day}: no records yet`;
  const part = (n: number) => `${(n / max) * 100}%`;

  return (
    <figure>
      <div role="img" aria-label={`Attendance for each day. ${points.filter((p) => p.kind === "working").map(label).join(". ")}`} className="flex h-40 items-end gap-[3px]">
        {points.map((p) => (
          <div key={p.date} title={label(p)} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            {p.kind === "working" ? (
              <>
                <div className="w-full rounded-t-[3px] bg-info" style={{ height: part(p.leave) }} />
                <div className="w-full bg-danger" style={{ height: part(p.absent) }} />
                <div className="w-full bg-warning" style={{ height: part(p.late) }} />
                <div className="w-full bg-success" style={{ height: part(p.onTime) }} />
              </>
            ) : p.kind === "off" ? (
              <div className="h-1.5 w-full rounded-full bg-off-soft" />
            ) : (
              <div className="h-1.5 w-full rounded-full border border-dashed border-border" />
            )}
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex gap-[3px] text-[10px] text-muted-foreground sm:text-[11px]">
        {points.map((p) => (
          <span
            key={p.date}
            className={cn("min-w-0 flex-1 text-center tabular-nums", p.day % 5 !== 1 && p.day !== points.length && "invisible")}
          >
            {p.day}
          </span>
        ))}
      </div>
      <Legend
        items={[
          ["bg-success", "On time"],
          ["bg-warning", "Late"],
          ["bg-danger", "Absent"],
          ["bg-info", "On leave"],
          ["bg-off-soft", "Day off"],
        ]}
      />
    </figure>
  );
}

export function Legend({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([dot, text]) => (
        <span key={text} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-sm", dot)} />
          {text}
        </span>
      ))}
    </figcaption>
  );
}
