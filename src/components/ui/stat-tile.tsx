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

/** A big number for the top of a screen. The icon and the number carry the status color; the card stays white. */
export function StatTile({ label, value, icon: Icon, tone = "neutral", hint, href, className }: StatTileProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", toneClasses[tone].soft)}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className={cn("mt-2 text-3xl font-bold leading-none tracking-tight tabular-nums", tone !== "neutral" && tone !== "off" && toneClasses[tone].text)}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  const base = "block rounded-2xl border border-border bg-card p-4 shadow-card";
  return href ? (
    <Link href={href} className={cn(base, "transition-colors hover:border-primary/50", className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(base, className)}>{body}</div>
  );
}
