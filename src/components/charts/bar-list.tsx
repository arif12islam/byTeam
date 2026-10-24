import { accentClasses, type Accent } from "@/components/accent";
import { toneClasses, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export type BarItem = {
  label: string;
  /** Small grey text under the label. */
  sub?: string;
  /** Length of the bar, 0 to `max`. */
  value: number;
  /** Text on the right, such as "92%". */
  display: string;
  tone?: Tone;
  /** A decorative color instead of a status tone, for bars that compare teams rather than judge them. */
  accent?: Accent;
};

/** Horizontal bars with a label and a value on each, for comparing teams. */
export function BarList({ items, max }: { items: readonly BarItem[]; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="grid gap-4">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{item.display}</span>
          </div>
          <div
            role="meter"
            aria-label={item.label}
            aria-valuemin={0}
            aria-valuemax={top}
            aria-valuenow={item.value}
            aria-valuetext={item.display}
            className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-secondary"
          >
            <div
              className={cn("h-full rounded-full", item.accent ? accentClasses[item.accent].solid : toneClasses[item.tone ?? "success"].solid)}
              style={{ width: `${Math.min(100, Math.max(0, (item.value / top) * 100))}%` }}
            />
          </div>
          {item.sub ? <p className="mt-1 text-xs text-muted-foreground">{item.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}
