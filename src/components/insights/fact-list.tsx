import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toneClasses, type Tone } from "@/components/ui/tone";
import type { Fact, FactTone } from "@/lib/insights/facts";
import { cn } from "@/lib/utils";

const DOT: Record<FactTone, string> = {
  danger: toneClasses.danger.solid,
  warning: toneClasses.warning.solid,
  info: toneClasses.info.solid,
  success: toneClasses.success.solid,
};

const BADGE_TONE: Record<FactTone, Tone> = { danger: "danger", warning: "warning", info: "info", success: "success" };

/** What the colour of the dot means, in words, for people who cannot see colour. */
const TONE_WORD: Record<FactTone, string> = { danger: "Problem", warning: "Needs a look", info: "Note", success: "Good news" };

/** What tapping a fact does, in a few words, from where it goes. */
export function actionLabel(href: string): string {
  const path = href.split("?")[0];
  if (/^\/attendance\/[^/]+\/\d{4}-\d{2}-\d{2}$/.test(path)) return "Open the day";
  if (/^\/attendance\/[^/]+$/.test(path)) return "Open calendar";
  if (path.startsWith("/attendance")) return "Open attendance";
  if (path.startsWith("/employees/new")) return "Add employee";
  if (path.startsWith("/employees")) return "Open employee";
  if (path.startsWith("/devices")) return "Open devices";
  if (path.startsWith("/payroll")) return "Open payroll";
  if (path.startsWith("/leave")) return "Open leave";
  if (path.startsWith("/reports")) return "Open reports";
  return "Open";
}

/**
 * Facts as rows: a small coloured dot, the sentence, and a link to where it is
 * about. `rich` adds the person's initials, the tone in words and what
 * tapping does, for the Insights screen. The Today card keeps the compact rows.
 */
export function FactList({ facts, className, rich = false }: { facts: readonly Fact[]; className?: string; rich?: boolean }) {
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {facts.map((fact) => {
        const row = rich ? (
          <>
            {fact.subjectName ? (
              <Avatar name={fact.subjectName} className="size-9 text-xs" />
            ) : (
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
                <span className={cn("size-2.5 rounded-full", DOT[fact.tone])} />
              </span>
            )}
            <span className="min-w-0 flex-1 text-sm">
              <span className="block">{fact.text}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge tone={BADGE_TONE[fact.tone]}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", DOT[fact.tone])} />
                  {TONE_WORD[fact.tone]}
                </Badge>
                {fact.href ? <span className="text-xs text-muted-foreground">{actionLabel(fact.href)}</span> : null}
              </span>
            </span>
            {fact.href ? <ChevronRight aria-hidden className="size-4 shrink-0 self-center text-muted-foreground" /> : null}
          </>
        ) : (
          <>
            <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[fact.tone])} />
            <span className="min-w-0 flex-1 text-sm">
              <span className="sr-only">{TONE_WORD[fact.tone]}: </span>
              {fact.text}
            </span>
            {fact.href ? <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
          </>
        );
        const base = rich ? "flex min-h-14 items-start gap-3 py-3" : "flex min-h-11 items-start gap-2.5 py-2.5";
        return (
          <li key={fact.id}>
            {fact.href ? (
              <Link href={fact.href} className={cn(base, "hover:bg-secondary/60")}>
                {row}
              </Link>
            ) : (
              <div className={base}>{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
