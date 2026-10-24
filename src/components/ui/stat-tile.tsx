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

/** A big number on a saturated gradient, for the top of a screen. Becomes a link when `href` is given. */
export function StatTile({ label, value, icon: Icon, tone = "neutral", hint, href, className }: StatTileProps) {
  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute -right-5 -top-5 size-24 rounded-full bg-white/20" />
      <span aria-hidden className="pointer-events-none absolute -bottom-8 -right-2 size-20 rounded-full bg-black/5" />
      <span className="relative grid size-9 place-items-center rounded-xl bg-white/25 ring-1 ring-white/30">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <p className="relative mt-3 text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</p>
      <p className="relative mt-1.5 text-sm opacity-90">{label}</p>
      {hint ? <p className="relative mt-0.5 text-xs opacity-75">{hint}</p> : null}
    </>
  );
  const base = cn("relative block overflow-hidden rounded-2xl p-4 shadow-card", toneClasses[tone].grad);
  return href ? (
    <Link href={href} className={cn(base, "transition-transform hover:-translate-y-0.5", className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(base, className)}>{body}</div>
  );
}
