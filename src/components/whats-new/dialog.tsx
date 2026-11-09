"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { Release } from "@/lib/whats-new/releases";
import { cn } from "@/lib/utils";

import { ReleaseVisual } from "./visuals";

type Props = {
  release: Release;
  /** Remembers that this person has seen the release. Called once when the tour closes, however it closes. */
  markSeen: () => Promise<void>;
};

/**
 * The tour shown the first time someone opens the app after an update: a
 * picture of each change with how it works, one step at a time. It slides up
 * from the bottom on a phone and sits in the middle on a bigger screen. Skip,
 * the last step, Escape and the Try it links all close it for good.
 */
export function WhatsNewDialog({ release, markSeen }: Props) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [, startTransition] = useTransition();
  const nextRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const total = release.items.length;
  const item = release.items[step];
  const last = step === total - 1;

  const close = useCallback(() => {
    setOpen(false);
    startTransition(() => {
      void markSeen();
    });
  }, [markSeen]);

  // Keys, and the page behind stays put while the tour is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") setStep((s) => Math.min(s + 1, total - 1));
      if (event.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close, total]);

  // Each step starts at the top, with the main button ready.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    nextRef.current?.focus();
  }, [step]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="flex max-h-[92dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-card sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm font-medium">
            What&apos;s new <span className="font-normal text-muted-foreground">· {release.title}</span>
          </p>
          <button
            type="button"
            onClick={close}
            aria-label="Skip the tour"
            className="grid size-9 place-items-center rounded-full hover:bg-secondary"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <ReleaseVisual visual={item.visual} />
          <div>
            <h2 id="whats-new-title" className="text-lg font-semibold tracking-tight">
              {item.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </div>
          <ol className="space-y-2">
            {item.steps.map((text, i) => (
              <li key={text} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
          {item.href ? (
            <Link href={item.href} onClick={close} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline underline-offset-4">
              {item.tryLabel ?? "Try it"}
            </Link>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center" role="group" aria-label={`Step ${step + 1} of ${total}`}>
            {release.items.map((entry, i) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}: ${entry.title}`}
                aria-current={i === step ? "step" : undefined}
                className="grid size-5 place-items-center"
              >
                <span className={cn("h-1.5 rounded-full transition-all", i === step ? "w-4 bg-primary" : "w-1.5 bg-border")} />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                <ChevronLeft aria-hidden />
                Back
              </Button>
            ) : null}
            <Button ref={nextRef} type="button" onClick={last ? close : () => setStep(step + 1)}>
              {last ? "Done" : "Next"}
              {last ? null : <ChevronRight aria-hidden />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
