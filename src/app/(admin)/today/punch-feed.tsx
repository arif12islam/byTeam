import { Fingerprint } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import type { FeedItem } from "@/lib/attendance/today";
import { formatOfficeTime } from "@/lib/time";

/** The latest punches of the day, newest first, one tight line each. Punches within five minutes get a "Now" badge. */
export function PunchFeed({ items, now }: { items: readonly FeedItem[]; now: Date }) {
  return (
    <Card className="p-3 sm:p-3.5">
      <CardTitle icon={Fingerprint}>
        Latest punches
      </CardTitle>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No punches yet today. They appear here the moment the device sends them.</p>
      ) : (
        <ol className="mt-1.5 divide-y divide-border/60">
          {items.map((item) => {
            // A device clock a little ahead of the server gives a punch slightly in the future, which is still fresh.
            const fresh = Math.abs(now.getTime() - item.at.getTime()) < 5 * 60_000;
            return (
              <li key={`${item.empCode}-${item.at.getTime()}`} className="flex items-center gap-2.5 py-1.5">
                {item.name ? (
                  <Avatar name={item.name} className="size-8 text-xs" />
                ) : (
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-warning-soft text-warning">
                    <Fingerprint className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm leading-tight">
                    <span className="truncate font-medium">{item.name ?? `Code ${item.empCode}`}</span>
                    {fresh ? <Badge tone="success" className="px-1.5 py-0 text-[10px] leading-4">Now</Badge> : null}
                    {item.name === null ? <Badge tone="warning" className="px-1.5 py-0 text-[10px] leading-4">No employee</Badge> : null}
                  </p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    {item.kind === "arrived" ? "Arrived" : "Punched again"}
                    {item.deviceName ? `, ${item.deviceName}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums">{formatOfficeTime(item.at)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
