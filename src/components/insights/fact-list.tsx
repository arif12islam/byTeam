import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { toneClasses } from "@/components/ui/tone";
import type { Fact, FactTone } from "@/lib/insights/facts";
import { cn } from "@/lib/utils";

const DOT: Record<FactTone, string> = {
  danger: toneClasses.danger.solid,
  warning: toneClasses.warning.solid,
  info: toneClasses.info.solid,
  success: toneClasses.success.solid,
};

/** What the colour of the dot means, in words, for people who cannot see colour. */
const TONE_WORD: Record<FactTone, string> = { danger: "Problem", warning: "Needs a look", info: "Note", success: "Good news" };

/** Facts as rows: a small coloured dot, the sentence, and a link to where it is about. */
export function FactList({ facts, className }: { facts: readonly Fact[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {facts.map((fact) => {
        const row = (
          <>
            <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[fact.tone])} />
            <span className="min-w-0 flex-1 text-sm">
              <span className="sr-only">{TONE_WORD[fact.tone]}: </span>
              {fact.text}
            </span>
            {fact.href ? <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : null}
          </>
        );
        return (
          <li key={fact.id}>
            {fact.href ? (
              <Link href={fact.href} className="flex min-h-11 items-start gap-2.5 py-2.5 hover:bg-secondary/60">
                {row}
              </Link>
            ) : (
              <div className="flex min-h-11 items-start gap-2.5 py-2.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
