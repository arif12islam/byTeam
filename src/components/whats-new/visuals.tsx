import { Bell, Check, ChevronDown, Lightbulb, Share, Trash2 } from "lucide-react";

import { BrandMark } from "@/components/brand";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { VISUALS, type VisualKey } from "@/lib/whats-new/releases";
import { cn } from "@/lib/utils";

/**
 * Small pictures of the app for the What's new tour. They are drawn from the
 * same pieces as the real screens, with made-up names, so they look like what
 * people will see. The numbered markers match the steps written under each one.
 * They are decoration: the words next to them say everything.
 */

function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-xl border border-border bg-secondary/60 p-4 sm:p-5", className)}>
      {children}
    </div>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-border bg-card p-3 shadow-xs", className)}>{children}</div>;
}

function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground", className)}>{n}</span>
  );
}

/** Puts a numbered marker at the corner of whatever it wraps. */
function Pin({ n, children, className }: { n: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {children}
      <Marker n={n} className="absolute -right-2 -top-2" />
    </div>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 truncate rounded-md border border-input bg-card px-2 py-1.5 text-xs">{value}</div>
    </div>
  );
}

function Line({ className }: { className?: string }) {
  return <div className={cn("h-2 rounded-full bg-secondary", className)} />;
}

function Button({ children, tone = "default", className }: { children: React.ReactNode; tone?: "default" | "outline" | "danger"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium",
        tone === "default" && "bg-primary text-primary-foreground",
        tone === "outline" && "border border-input bg-card",
        tone === "danger" && "border border-input bg-card text-destructive",
        className,
      )}
    >
      {children}
    </span>
  );
}

function AppVisual() {
  return (
    <Stage>
      <div className="flex items-center justify-center gap-5">
        <div className="w-32 shrink-0 rounded-[1.4rem] border-4 border-zinc-800 bg-card">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 pb-2 pt-3">
            <BrandMark className="size-5 rounded" />
            <span className="text-[11px] font-semibold">byTeam</span>
          </div>
          <div className="space-y-2 px-2.5 py-3">
            <Line className="w-3/4" />
            <Line />
            <Line className="w-2/3" />
            <Line className="w-5/6" />
          </div>
          <div className="flex items-center justify-around border-t border-border px-1 py-2">
            {["Today", "Attend", "Leave"].map((name) => (
              <span key={name} className="text-[9px] text-muted-foreground">
                {name}
              </span>
            ))}
            <Pin n={1}>
              <Share className="size-3.5 text-info" />
            </Pin>
          </div>
        </div>
        <div className="min-w-0 space-y-2.5">
          <Panel className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Share</p>
            <Pin n={2}>
              <div className="flex items-center justify-between rounded-md border border-input px-2 py-1.5 text-xs">
                Add to Home Screen
                <span className="text-lg leading-none">+</span>
              </div>
            </Pin>
          </Panel>
          <div className="flex items-center gap-2.5">
            <Pin n={3}>
              <BrandMark className="size-10 rounded-xl" />
            </Pin>
            <span className="text-xs font-medium">byTeam</span>
          </div>
        </div>
      </div>
    </Stage>
  );
}

function LoginVisual() {
  return (
    <Stage>
      <Panel className="space-y-3">
        <Pin n={1} className="w-fit pr-4">
          <p className="text-sm font-semibold">Your login</p>
        </Pin>
        <Pin n={2}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" value="Mother Love Air Travels" />
            <Field label="Email" value="byteam@bykorp.com" />
            <Field label="New password" value="••••••••••" />
            <Field label="New password again" value="••••••••••" />
          </div>
        </Pin>
        <div className="flex items-end gap-2">
          <Field label="Current password" value="••••••••••" className="flex-1" />
          <Pin n={3}>
            <Button>Save login</Button>
          </Pin>
        </div>
      </Panel>
    </Stage>
  );
}

function LateVisual() {
  return (
    <Stage>
      <div className="space-y-2.5">
        <Pin n={1} className="w-fit pr-4">
          <span className="inline-flex rounded-md bg-card px-2 py-1 text-xs font-medium shadow-xs">Today</span>
        </Pin>
        <Panel className="flex items-center gap-3">
          <Avatar name="Anwar Hossain" className="size-8 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Anwar Hossain</p>
            <p className="text-xs text-muted-foreground">In 11:05</p>
          </div>
          <Pin n={2}>
            <Badge tone="warning">2 h 5 min late</Badge>
          </Pin>
        </Panel>
        <p className="text-xs text-muted-foreground">
          Before: <span className="line-through">125 min late</span>
        </p>
      </div>
    </Stage>
  );
}

function DepartmentsVisual() {
  const options = ["Accounts", "Operations", "Sales"];
  return (
    <Stage>
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="space-y-2">
          <Pin n={1} className="w-fit pr-4">
            <p className="text-sm font-semibold">Departments</p>
          </Pin>
          {[
            ["Accounts", "4 employees"],
            ["Operations", "6 employees"],
            ["Sales", "3 employees"],
          ].map(([name, count]) => (
            <div key={name} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground">{count}</span>
            </div>
          ))}
        </Panel>
        <Panel className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Department</p>
          <Pin n={2}>
            <div className="flex items-center justify-between rounded-md border border-input bg-card px-2 py-1.5 text-xs">
              Operations
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </div>
          </Pin>
          <div className="rounded-md border border-border bg-card text-xs shadow-sm">
            {options.map((name) => (
              <div key={name} className={cn("flex items-center justify-between px-2 py-1.5", name === "Operations" && "bg-secondary")}>
                {name}
                {name === "Operations" ? <Check className="size-3.5" /> : null}
              </div>
            ))}
          </div>
          <Pin n={3} className="w-fit pr-4">
            <span className="text-[11px] text-info underline underline-offset-2">Manage departments</span>
          </Pin>
        </Panel>
      </div>
    </Stage>
  );
}

function LeavingPunchVisual() {
  return (
    <Stage>
      <Panel className="space-y-3">
        <Pin n={1}>
          <div className="flex items-start gap-2.5 rounded-md border border-input p-2.5 text-xs">
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-input bg-card" />
            <span>
              <span className="font-medium">Use the leaving punch</span>
              <span className="block text-muted-foreground">Off: only the first punch counts.</span>
            </span>
          </div>
        </Pin>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-secondary p-2">
            <p className="text-[11px] text-muted-foreground">On</p>
            <p className="mt-0.5 font-medium">In 09:02, out 18:10</p>
          </div>
          <div className="rounded-md bg-secondary p-2">
            <p className="text-[11px] text-muted-foreground">Off</p>
            <p className="mt-0.5 font-medium">In 09:02</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pin n={2}>
            <Button>Save company settings</Button>
          </Pin>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Marker n={3} />
            Applies from today
          </span>
        </div>
      </Panel>
    </Stage>
  );
}

function ExportVisual() {
  return (
    <Stage>
      <Panel className="space-y-3">
        <Pin n={1} className="w-fit pr-4">
          <p className="text-sm font-semibold">Export attendance</p>
        </Pin>
        <Pin n={2}>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {["Excel", "PDF", "CSV"].map((name) => (
                <div key={name} className={cn("rounded-md border px-2 py-1.5 text-center font-medium", name === "PDF" ? "border-primary bg-accent" : "border-input")}>
                  {name}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <Field label="Department" value="Sales" />
              <Field label="Employee" value="Everyone" />
              <Field label="Only people who" value="Were late" />
            </div>
          </div>
        </Pin>
        <Pin n={3} className="w-fit pr-4">
          <Button>Download</Button>
        </Pin>
      </Panel>
    </Stage>
  );
}

function DeleteVisual() {
  return (
    <Stage>
      <div className="space-y-2.5">
        <Panel className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Morning shift</p>
            <p className="text-xs text-muted-foreground">0 employees</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pin n={1}>
              <Button tone="danger">
                <Trash2 className="size-3.5" />
                Delete shift
              </Button>
            </Pin>
            <span className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] shadow-sm">
              <Marker n={2} />
              Delete the shift Morning shift?
            </span>
          </div>
        </Panel>
        <Panel className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Day shift</p>
            <p className="text-xs text-muted-foreground">3 employees</p>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Marker n={3} className="mt-0.5" />
            To delete this shift, move its 3 employees to another shift first.
          </p>
        </Panel>
      </div>
    </Stage>
  );
}

function HolidaysVisual() {
  const rows: [string, string, boolean, string | null][] = [
    ["Victory Day", "Wed 16 Dec 2026", true, null],
    ["Christmas Day", "Fri 25 Dec 2026", false, "Weekly off day"],
    ["Bengali New Year", "Tue 14 Apr 2026", false, "Before today"],
  ];
  return (
    <Stage>
      <Panel className="space-y-3">
        <Pin n={1} className="w-fit pr-4">
          <p className="text-sm font-semibold">Import public holidays</p>
        </Pin>
        <Pin n={2}>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="rounded-md border border-primary bg-accent px-2 py-1.5 font-medium">Google&apos;s calendar</div>
            <div className="rounded-md border border-input px-2 py-1.5 font-medium">Paste a list</div>
          </div>
        </Pin>
        <ul className="divide-y divide-border rounded-md border border-border text-xs">
          {rows.map(([name, date, ticked, tag]) => (
            <li key={name} className="flex items-center gap-2 px-2 py-1.5">
              <span className={cn("grid size-4 shrink-0 place-items-center rounded border", ticked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
                {ticked ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{name}</span>
                <span className="block text-muted-foreground">{date}</span>
              </span>
              {tag ? <Badge>{tag}</Badge> : null}
            </li>
          ))}
        </ul>
        <Pin n={3} className="w-fit pr-4">
          <Button>Add 1 holiday</Button>
        </Pin>
      </Panel>
    </Stage>
  );
}

function NotificationsVisual() {
  return (
    <Stage>
      <div className="space-y-3">
        <Panel className="space-y-2">
          <Pin n={1} className="w-fit pr-4">
            <p className="text-xs text-muted-foreground">Home Screen app</p>
          </Pin>
          <div className="flex items-start gap-2.5 rounded-xl bg-secondary p-2.5">
            <BrandMark className="size-8 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">Fingerprint device offline</p>
              <p className="text-xs text-muted-foreground">Front door was last heard from 2 h ago. Check its power and the office laptop.</p>
            </div>
            <span className="text-[10px] text-muted-foreground">now</span>
          </div>
        </Panel>
        <Panel className="space-y-2">
          <Pin n={2} className="w-fit pr-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Bell className="size-3.5" />
              Notifications
            </p>
          </Pin>
          {["Fingerprint device offline", "Morning summary", "Unknown code punched"].map((name) => (
            <div key={name} className="flex items-center gap-2 rounded-md border border-primary bg-accent px-2 py-1.5 text-xs">
              <Check className="size-3.5" />
              {name}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Pin n={3}>
              <Button tone="outline">Send a test</Button>
            </Pin>
          </div>
        </Panel>
      </div>
    </Stage>
  );
}

function InsightsVisual() {
  const facts: [string, string][] = [
    ["bg-red-500", "Front door was last heard from 2 h ago. Check its power and the office laptop."],
    ["bg-amber-400", "Rahim was late 6 times so far this month, up from 2 at this point last month."],
    ["bg-blue-500", "Sharif has no leaving punch on 4 days this month."],
  ];
  return (
    <Stage>
      <Panel className="space-y-1">
        <Pin n={1} className="w-fit pr-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb className="size-3.5 text-muted-foreground" />
            Worth a look
          </p>
        </Pin>
        <ul className="divide-y divide-border">
          {facts.map(([dot, text], i) => (
            <li key={text} className="flex items-start gap-2 py-2 text-xs">
              <span className={cn("mt-1 size-2 shrink-0 rounded-full", dot)} />
              <span className="min-w-0 flex-1">{text}</span>
              {i === 1 ? <Marker n={2} /> : null}
            </li>
          ))}
        </ul>
        <div className="flex justify-end pt-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary underline underline-offset-2">
            See all
            <Marker n={3} />
          </span>
        </div>
      </Panel>
    </Stage>
  );
}

const COMPONENTS: Record<VisualKey, () => React.JSX.Element> = {
  app: AppVisual,
  login: LoginVisual,
  late: LateVisual,
  departments: DepartmentsVisual,
  leavingPunch: LeavingPunchVisual,
  export: ExportVisual,
  delete: DeleteVisual,
  holidays: HolidaysVisual,
  notifications: NotificationsVisual,
  insights: InsightsVisual,
};

/** The picture for a release item. */
export function ReleaseVisual({ visual }: { visual: VisualKey }) {
  const Visual = COMPONENTS[visual];
  return <Visual />;
}

/** Every picture there is, for tests. */
export const VISUAL_KEYS = VISUALS;
