import type { ArrivalBucket } from "@/lib/attendance/today";

/**
 * A bar for each quarter hour: green for people on time, amber stacked on top
 * for the late ones. Plain HTML and CSS, so it renders on the server.
 */
export function ArrivalsChart({ buckets }: { buckets: readonly ArrivalBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  // Label about every hour so the axis stays readable on a phone.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 5));
  const summary = buckets.map((b) => `${b.label}: ${b.count}`).join(", ");

  return (
    <figure>
      <div role="img" aria-label={`Arrivals, ${total} people. ${summary}`} className="flex h-28 items-end gap-1">
        {buckets.map((bucket) => {
          const onTime = bucket.count - bucket.late;
          return (
            <div key={bucket.label} className="flex h-full min-w-0 max-w-12 flex-1 flex-col justify-end" title={`${bucket.label}: ${bucket.count}`}>
              {bucket.late > 0 ? (
                <div className="w-full rounded-t-md bg-warning" style={{ height: `${(bucket.late / max) * 100}%` }} />
              ) : null}
              {onTime > 0 ? (
                <div
                  className={`w-full bg-success ${bucket.late > 0 ? "" : "rounded-t-md"}`}
                  style={{ height: `${(onTime / max) * 100}%` }}
                />
              ) : null}
              {bucket.count === 0 ? <div className="h-0.5 w-full rounded-full bg-border" /> : null}
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-2 flex gap-1 text-[11px] text-muted-foreground">
        {buckets.map((bucket, i) => (
          <span key={bucket.label} className="min-w-0 max-w-12 flex-1 overflow-visible whitespace-nowrap tabular-nums">
            {i % labelEvery === 0 ? bucket.label : ""}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-success" aria-hidden />
          On time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-warning" aria-hidden />
          Late
        </span>
      </figcaption>
    </figure>
  );
}
