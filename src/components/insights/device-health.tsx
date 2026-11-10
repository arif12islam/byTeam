import { Fingerprint } from "lucide-react";
import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { toneClasses } from "@/components/ui/tone";
import { formatDuration } from "@/lib/time";
import type { DeviceLine } from "@/lib/insights/summary";
import { cn } from "@/lib/utils";

const STATUS: Record<DeviceLine["status"], { word: string; dot: string }> = {
  online: { word: "Online", dot: toneClasses.success.solid },
  offline: { word: "Offline", dot: toneClasses.danger.solid },
  never: { word: "Never connected", dot: toneClasses.off.solid },
};

/** The fingerprint device: when it was last heard from, whether its clock is right, and unlinked codes. */
export function DeviceHealthCard({ devices, unknownCodes }: { devices: readonly DeviceLine[]; unknownCodes: number }) {
  return (
    <Card>
      <CardTitle
        icon={Fingerprint}
        action={
          <Link href="/devices" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            Open devices
          </Link>
        }
      >
        Device and data
      </CardTitle>
      {devices.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">No device added yet. Add one under Devices.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {devices.map((d) => {
            const drift = d.driftSeconds !== null && Math.abs(d.driftSeconds) >= 60 ? `Clock ${formatDuration(Math.round(Math.abs(d.driftSeconds) / 60))} ${d.driftSeconds > 0 ? "fast" : "slow"}` : d.driftSeconds === null ? "Clock not checked yet" : "Clock correct";
            return (
              <li key={d.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.lastSeen ? `Last heard ${d.lastSeen.toLowerCase()}` : "Never heard from"}. {drift}.
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
                  <span aria-hidden className={cn("size-2 rounded-full", STATUS[d.status].dot)} />
                  {STATUS[d.status].word}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {unknownCodes === 0 ? "No unlinked codes punched in the last two weeks." : `${unknownCodes} unlinked ${unknownCodes === 1 ? "code" : "codes"} punched in the last two weeks.`}
        {unknownCodes > 0 ? (
          <>
            {" "}
            <Link href="/today" className="font-medium text-primary underline underline-offset-4">
              See them on Today
            </Link>
            .
          </>
        ) : null}
      </p>
    </Card>
  );
}
