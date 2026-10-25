import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { clockState, describeClock } from "@/lib/devices/clock";
import { describeAge, deviceStatus, listDevices, OFFLINE_AFTER_MINUTES, type DeviceStatus } from "@/lib/devices/devices";
import { listRecentLines, type ReceivedLine } from "@/lib/punches/recent";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { requireRole } from "@/lib/session";
import { formatOfficeDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { AddDeviceForm } from "./add-device-form";
import { DeviceControls } from "./device-card";

export const metadata: Metadata = { title: "Devices" };

export default function DevicesPage() {
  return (
    <>
      <PageHeader
        title="Devices"
        description="Only devices listed here can send punches. Add the serial number of each one."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading devices</p>}>
        <DevicesContent />
      </Suspense>
    </>
  );
}

const statusLabel: Record<DeviceStatus, string> = {
  online: "Online",
  offline: "Offline",
  never: "Never connected",
};

function StatusBadge({ status, active }: { status: DeviceStatus; active: boolean }) {
  const tone = !active ? "off" : status === "online" ? "success" : status === "offline" ? "danger" : "off";
  const dot = !active ? "border border-current" : status === "online" ? "bg-current" : status === "offline" ? "bg-current" : "bg-current/50";
  return (
    <Badge tone={tone} className="px-3 py-1 text-sm">
      <span aria-hidden className={cn("size-2 rounded-full", dot)} />
      {active ? statusLabel[status] : "Not accepted"}
    </Badge>
  );
}

/**
 * The last punch lines exactly as the device sent them, tabs kept, so they can
 * be copied and compared with what the simulator sends.
 */
function RecentLines({ lines }: { lines: ReceivedLine[] }) {
  return (
    <details className="group mt-4 rounded-lg border border-border">
      <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Last lines received
        <span className="text-xs font-normal text-muted-foreground">
          {lines.length === 0 ? "None yet" : lines.length === 1 ? "1 line" : `${lines.length} lines`}
        </span>
      </summary>
      <div className="border-t border-border px-3 py-3">
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No punches received from this device yet. Punch on the device, then reload this page.</p>
        ) : (
          <>
            <pre className="overflow-x-auto rounded-md bg-secondary p-3 font-mono text-xs leading-relaxed [tab-size:4]">
              {lines.map((line) => line.rawLine).join("\n")}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Newest first, exactly as the device sent them. The last one arrived {formatOfficeDateTime(lines[0].receivedAt)}.
            </p>
          </>
        )}
      </div>
    </details>
  );
}

/** Reads the current time, so it renders after the session check, inside Suspense. */
async function DevicesContent() {
  await requireRole("owner", "hr");

  const db = getDb();
  const [list, unmatched, recentLines] = await Promise.all([listDevices(db), listUnmatchedCodes(db), listRecentLines(db)]);
  const now = new Date();

  return (
    <div className="mt-6 grid max-w-3xl gap-6">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <h2 className="text-base font-semibold">Add a device</h2>
        <div className="mt-5">
          <AddDeviceForm />
        </div>
      </section>

      {list.length === 0 ? (
        <Card className="border-dashed text-sm text-muted-foreground shadow-none">
          No devices yet. Add the serial number above, then point the device at this server.
        </Card>
      ) : (
        list.map((device) => {
          const status = deviceStatus(device.lastSeenAt, now);
          const age = describeAge(device.lastSeenAt, now);
          const clock = clockState(device.clockOffsetSeconds);
          return (
            <section key={device.id} className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{device.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Serial number {device.serialNo}</p>
                </div>
                <StatusBadge status={status} active={device.active} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {device.lastSeenAt && age ? (
                  <>
                    Last seen {age}, {formatOfficeDateTime(device.lastSeenAt)}.
                    {device.active && status === "offline"
                      ? ` Offline means nothing heard for more than ${OFFLINE_AFTER_MINUTES} minutes.`
                      : ""}
                  </>
                ) : (
                  "It has not contacted the server yet."
                )}
              </p>
              {device.active ? (
                clock.kind === "drifted" ? (
                  <Alert tone="danger" icon={TriangleAlert} className="mt-3">
                    {describeClock(clock)}
                    {device.clockCheckedAt ? ` Checked ${formatOfficeDateTime(device.clockCheckedAt)}.` : ""}
                  </Alert>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {describeClock(clock)}
                    {clock.kind !== "unchecked" && device.clockCheckedAt ? ` Checked ${formatOfficeDateTime(device.clockCheckedAt)}.` : ""}
                  </p>
                )
              ) : null}
              <RecentLines lines={recentLines.get(device.serialNo) ?? []} />
              <div className="mt-5 border-t border-border pt-5">
                <DeviceControls device={device} />
              </div>
            </section>
          );
        })
      )}

      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <h2 className="text-base font-semibold">Punches from unknown employee codes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These codes punched on a device but no employee has them. Usually someone was enrolled at the device and not
          added here yet. Add them with the same code and their punches count automatically.
        </p>
        {unmatched.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            None. Every punch received so far belongs to an employee.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-md border border-border">
            {unmatched.map((row) => (
              <li key={row.empCode} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Code {row.empCode}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.punches === 1 ? "1 punch" : `${row.punches} punches`}, last{" "}
                    {formatOfficeDateTime(row.lastPunchAt)}
                    {row.devices.length > 0 ? ` on ${row.devices.join(", ")}` : ""}
                  </p>
                </div>
                <Link
                  href={`/employees/new?code=${encodeURIComponent(row.empCode)}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Add employee with this code
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
