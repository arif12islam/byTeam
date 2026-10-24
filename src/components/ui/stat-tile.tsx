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

/** A big number with an icon, for the top of a screen. Becomes a link when `href` is given. */
export function StatTile({ label, value, icon: Icon, tone = "neutral", hint, href, className }: StatTileProps) {
  const body = (
    <>
      <span className={cn("grid size-9 place-items-center rounded-xl", toneClasses[tone].soft)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <p className={cn("mt-3 text-3xl font-semibold leading-none tracking-tight tabular-nums", tone !== "neutral" && toneClasses[tone].text)}>{value}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  const base = cn("block rounded-2xl border border-border bg-gradient-to-br to-card p-4 shadow-card", toneClasses[tone].tint);
  return href ? (
    <Link href={href} className={cn(base, "transition-colors hover:border-primary/40", className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(base, className)}>{body}</div>
  );
}
