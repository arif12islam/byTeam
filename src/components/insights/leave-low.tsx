import { Plane } from "lucide-react";
import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { toneClasses } from "@/components/ui/tone";
import type { LeaveLow } from "@/lib/insights/summary";
import { cn } from "@/lib/utils";

/** Leave balances nearly used up this year. */
export function LeaveLowCard({ rows }: { rows: readonly LeaveLow[] }) {
  return (
    <Card>
      <CardTitle
        icon={Plane}
        action={
          <Link href="/leave" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Open leave
          </Link>
        }
      >
        Leave running low
      </CardTitle>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">Everyone has enough leave left.</p>
      ) : (
        <ul className="mt-3 grid gap-4">
          {rows.map((r) => (
            <li key={`${r.employeeId}:${r.type}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{r.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {r.remaining} of {r.quota} days left
                </span>
              </div>
              <div
                role="meter"
                aria-label={`${r.name}, ${r.type}`}
                aria-valuemin={0}
                aria-valuemax={r.quota}
                aria-valuenow={r.remaining}
                aria-valuetext={`${r.remaining} of ${r.quota} days left`}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary"
              >
                <div className={cn("h-full rounded-full", toneClasses.info.solid)} style={{ width: `${Math.min(100, (r.remaining / r.quota) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.type}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
