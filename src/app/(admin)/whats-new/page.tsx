import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { ReleaseVisual } from "@/components/whats-new/visuals";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/session";
import { formatOfficeDate } from "@/lib/time";
import { RELEASES } from "@/lib/whats-new/releases";

export const metadata: Metadata = { title: "What's new" };

export default function WhatsNewPage() {
  return (
    <>
      <PageHeader title="What's new" description="Every update, with a picture of the change and how it works." />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading</p>}>
        <WhatsNewContent />
      </Suspense>
    </>
  );
}

async function WhatsNewContent() {
  await requireRole("owner", "hr");

  return (
    <div className="mt-6 grid max-w-4xl gap-8">
      {RELEASES.map((release) => (
        <section key={release.id} aria-labelledby={`release-${release.id}`} className="grid gap-4">
          <div>
            <h2 id={`release-${release.id}`} className="text-lg font-semibold tracking-tight">
              {release.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatOfficeDate(release.date)}. {release.summary}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {release.items.map((item) => (
              <Card key={item.id} className="flex flex-col gap-4">
                <ReleaseVisual visual={item.visual} />
                <div>
                  <h3 className="text-base font-semibold">{item.title}</h3>
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
                  <Link href={item.href} className="mt-auto inline-flex min-h-10 items-center text-sm font-medium text-primary underline underline-offset-4">
                    {item.tryLabel ?? "Try it"}
                  </Link>
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
