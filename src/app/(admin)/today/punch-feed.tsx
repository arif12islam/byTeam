import { Fingerprint, LogIn, Repeat2 } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import type { FeedItem } from "@/lib/attendance/today";
import { formatOfficeTime } from "@/lib/time";

/** The latest punches of the day, newest first. Punches in the last five minutes get a "Just now" badge. */
export function PunchFeed({ items, now }: { items: readonly FeedItem[]; now: Date }) {
  return (
    <Card>
      <CardTitle icon={Fingerprint} count={items.length > 0 ? items.length : undefined}>
        Latest punches
      </CardTitle>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No punches yet today. They appear here the moment the device sends them.</p>
      ) : (
        <ol className="mt-3 grid">
          {items.map((item, index) => {
            // A device clock a little ahead of the server gives a punch slightly in the future, which is still fresh.
            const fresh = Math.abs(now.getTime() - item.at.getTime()) < 5 * 60_000;
            const Icon = item.kind === "arrived" ? LogIn : Repeat2;
            return (
              <li key={`${item.empCode}-${item.at.getTime()}`} className="relative flex gap-3 pb-4 last:pb-0">
                {index < items.length - 1 ? <span aria-hidden className="absolute left-[19px] top-10 h-[calc(100%-2.25rem)] w-px bg-border" /> : null}
                {item.name ? (
                  <Avatar name={item.name} className="size-10" />
                ) : (
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
                    <Fingerprint className="size-[18px]" />
                  </span>
                )}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="truncate font-medium">{item.name ?? `Code ${item.empCode}`}</span>
                    {fresh ? <Badge tone="success">Just now</Badge> : null}
                    {item.name === null ? <Badge tone="warning">No employee</Badge> : null}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5" aria-hidden />
                    <span className="tabular-nums">{formatOfficeTime(item.at)}</span>
                    {item.kind === "arrived" ? "arrived" : "punched again"}
                    {item.deviceName ? `, ${item.deviceName}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
