import type { ArrivalBucket } from "@/lib/attendance/today";
import type { ArrivalStats } from "@/lib/attendance/today-summary";
import { cn } from "@/lib/utils";

/**
 * A bar for each quarter hour: green for people on time, amber stacked on top
 * for the late ones, with a dashed line where the shift starts. Plain HTML and
 * CSS, so it renders on the server.
 */
export function ArrivalsChart({ buckets, stats, startLabel }: { buckets: readonly ArrivalBucket[]; stats: ArrivalStats; startLabel: string | null }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const summary = buckets
    .filter((b) => b.count > 0)
    .map((b) => `${b.label}: ${b.count}`)
    .join(", ");
  const hasLate = buckets.some((b) => b.late > 0);

  return (
    <figure>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["First in", stats.first ?? "-"],
            ["Middle", stats.median ?? "-"],
            ["Late", String(stats.late)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border px-2 py-2">
            <dd className="text-base font-semibold leading-none tabular-nums">{value}</dd>
            <dt className="mt-1.5 text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      <div
        role="img"
        aria-label={`Arrivals by quarter hour, ${stats.total} ${stats.total === 1 ? "person" : "people"}. ${summary}.${startLabel ? ` The shift starts at ${startLabel}.` : ""}`}
        className="mt-4 flex h-24 items-end gap-[3px] border-b border-border"
      >
        {buckets.map((bucket) => {
          const onTime = bucket.count - bucket.late;
          return (
            <div
              key={bucket.label}
              title={`${bucket.label}: ${bucket.count}`}
              className={cn("relative flex h-full min-w-0 flex-1 flex-col justify-end", bucket.label === startLabel && "border-l border-dashed border-foreground/40")}
            >
              {bucket.count === max && bucket.count > 0 ? (
                <span className="mb-1 text-center text-[11px] font-medium leading-none tabular-nums text-muted-foreground">{bucket.count}</span>
              ) : null}
              {bucket.late > 0 ? <div className="w-full rounded-t-[3px] bg-amber-400" style={{ height: `${(bucket.late / max) * 80}%` }} /> : null}
              {onTime > 0 ? (
                <div className={cn("w-full bg-green-500", bucket.late > 0 ? "mt-[2px]" : "rounded-t-[3px]")} style={{ height: `${(onTime / max) * 80}%` }} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-1.5 flex gap-[3px] text-[11px] text-muted-foreground">
        {buckets.map((bucket) => (
          <span key={bucket.label} className="min-w-0 flex-1 overflow-visible whitespace-nowrap tabular-nums">
            {bucket.label === startLabel ? <span className="font-medium text-foreground">{bucket.label} start</span> : bucket.label.endsWith(":00") && bucket.label !== startLabel ? bucket.label : ""}
          </span>
        ))}
      </div>
      {hasLate ? (
        <figcaption className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-green-500" aria-hidden />
            On time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-amber-400" aria-hidden />
            Late
          </span>
        </figcaption>
      ) : null}
    </figure>
  );
}
