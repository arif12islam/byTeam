import { cn } from "@/lib/utils";

export type Column = {
  label: string;
  /** Null draws an empty slot. */
  value: number | null;
  /** Text above the column. */
  display?: string;
  highlight?: boolean;
};

/** Vertical columns with a label under each, for a few months side by side. */
export function ColumnChart({ columns }: { columns: readonly Column[] }) {
  const max = Math.max(1, ...columns.map((c) => c.value ?? 0));
  return (
    <div
      role="img"
      aria-label={columns.map((c) => `${c.label}: ${c.value === null ? "no run" : (c.display ?? c.value)}`).join(", ")}
      className="flex items-end gap-2 sm:gap-3"
    >
      {columns.map((c) => (
        <div key={c.label} className="flex min-w-0 flex-1 flex-col items-center">
          <p className="mb-1 h-4 max-w-full truncate text-[11px] font-medium tabular-nums text-muted-foreground">
            {c.value === null ? "" : c.display}
          </p>
          <div className="flex h-32 w-full items-end">
            {c.value === null ? (
              <div className="h-1.5 w-full rounded-full border border-dashed border-border" />
            ) : (
              <div
                className={cn("w-full rounded-t-lg", c.highlight ? "bg-primary" : "bg-muted-foreground/25")}
                style={{ height: `${Math.max(3, (c.value / max) * 100)}%` }}
              />
            )}
          </div>
          <p className={cn("mt-2 text-xs", c.highlight ? "font-semibold" : "text-muted-foreground")}>{c.label}</p>
        </div>
      ))}
    </div>
  );
}
