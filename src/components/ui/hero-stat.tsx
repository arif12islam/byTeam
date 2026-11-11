import { toneClasses, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

/**
 * A number with a label that sits inside a HeroPanel. A status shows as a
 * small dot beside the label, never as a colored panel.
 */
export function HeroStat({
  label,
  value,
  tone = "neutral",
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  hint?: string;
  className?: string;
}) {
  return (
    <div data-slot="hero-stat" className={cn("min-w-0 rounded-xl border border-border bg-card/80 px-3.5 py-3", className)}>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {tone !== "neutral" ? <span aria-hidden className={cn("size-2 shrink-0 rounded-full", toneClasses[tone].solid)} /> : null}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
