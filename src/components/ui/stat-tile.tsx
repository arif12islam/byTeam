import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { toneClasses, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  href?: string;
  className?: string;
};

/** A number with a label, for the top of a screen. The status shows as a small dot, the rest stays neutral. */
export function StatTile({ label, value, icon: Icon, tone = "neutral", hint, href, className }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          {tone !== "neutral" ? <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneClasses[tone].solid)} /> : null}
          <span className="truncate">{label}</span>
        </p>
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  const base = "block rounded-xl border border-border bg-card p-4 shadow-card";
  return href ? (
    <Link href={href} className={cn(base, "transition-colors hover:bg-secondary/50", className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(base, className)}>{body}</div>
  );
}
