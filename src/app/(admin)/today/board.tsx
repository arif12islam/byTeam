"use client";

import {
  AlarmClock,
  CalendarOff,
  ChevronDown,
  Hourglass,
  Plane,
  Search,
  UserCheck,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { toneClasses, type Tone } from "@/components/ui/tone";
import type { TodayGroup } from "@/lib/attendance/today";
import { cn } from "@/lib/utils";

/** One person on the board, with everything already turned into text so it can cross to the browser. */
export type BoardEntry = {
  id: string;
  empCode: string;
  name: string;
  department: string | null;
  group: TodayGroup;
  late: boolean;
  tone: Tone;
  badge: string;
  detail: string;
  shiftLabel: string;
  /** Punch times today as HH:MM, oldest first. */
  punches: string[];
  missingOut: boolean;
};

export type BoardCounts = { in: number; late: number; notInYet: number; absent: number; onLeave: number };

type Filter = "all" | "in" | "late" | "not_in_yet" | "absent" | "on_leave";

const matches: Record<Filter, (entry: BoardEntry) => boolean> = {
  all: () => true,
  in: (e) => e.group === "in" || e.group === "worked_off_day",
  late: (e) => e.group === "in" && e.late,
  not_in_yet: (e) => e.group === "not_in_yet",
  absent: (e) => e.group === "absent",
  on_leave: (e) => e.group === "on_leave",
};

const tiles: { filter: Exclude<Filter, "all">; label: string; icon: LucideIcon; tone: Tone; count: keyof BoardCounts }[] = [
  { filter: "in", label: "In", icon: UserCheck, tone: "success", count: "in" },
  { filter: "late", label: "Late", icon: AlarmClock, tone: "warning", count: "late" },
  { filter: "not_in_yet", label: "Not in yet", icon: Hourglass, tone: "off", count: "notInYet" },
  { filter: "absent", label: "Absent", icon: UserX, tone: "danger", count: "absent" },
  { filter: "on_leave", label: "On leave", icon: Plane, tone: "info", count: "onLeave" },
];

const sections: { group: TodayGroup; title: string; hint?: string; icon: LucideIcon }[] = [
  { group: "absent", title: "Absent", hint: "No punch, and the shift is over.", icon: UserX },
  { group: "not_in_yet", title: "Not in yet", hint: "No punch so far. Their shift has not ended.", icon: Hourglass },
  { group: "in", title: "In", icon: UserCheck },
  { group: "worked_off_day", title: "Came in on a day off", icon: CalendarOff },
  { group: "on_leave", title: "On leave", icon: Plane },
];

function Row({ entry, date, open, onToggle }: { entry: BoardEntry; date: string; open: boolean; onToggle: () => void }) {
  const panelId = `punches-${entry.id}`;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-secondary/60"
      >
        <Avatar name={entry.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            Code {entry.empCode}
            {entry.department ? `, ${entry.department}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={entry.tone}>{entry.badge}</Badge>
          {entry.detail ? <p className="text-xs tabular-nums text-muted-foreground">{entry.detail}</p> : null}
        </div>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="mb-3 ml-[3.25rem] rounded-xl bg-secondary/70 p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Punches today</p>
          {entry.punches.length === 0 ? (
            <p className="mt-1 text-muted-foreground">No punches yet. Shift {entry.shiftLabel}.</p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {entry.punches.map((time, i) => (
                <li key={`${time}-${i}`} className="rounded-lg bg-card px-2 py-1 text-xs font-medium tabular-nums shadow-sm">
                  {time}
                </li>
              ))}
            </ul>
          )}
          {entry.missingOut ? <p className="mt-2 text-xs text-warning">No leaving punch yet.</p> : null}
          <Link
            href={`/attendance/${entry.id}/${date}`}
            className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2"
          >
            Open this day
          </Link>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Today's people, as a board you can poke at: the tiles on top filter the
 * list, the search box and department menu narrow it, and each row opens to
 * show that person's punches.
 */
export function TodayBoard({ entries, counts, date }: { entries: BoardEntry[]; counts: BoardCounts; date: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const departments = useMemo(
    () => [...new Set(entries.map((e) => e.department).filter((d): d is string => Boolean(d)))].sort((a, b) => a.localeCompare(b)),
    [entries],
  );

  const needle = query.trim().toLowerCase();
  const visible = entries.filter(
    (e) =>
      matches[filter](e) &&
      (department === "" || e.department === department) &&
      (needle === "" || e.name.toLowerCase().includes(needle) || e.empCode.toLowerCase().includes(needle)),
  );
  const narrowed = filter !== "all" || needle !== "" || department !== "";
  const active = tiles.find((t) => t.filter === filter);

  const clear = () => {
    setFilter("all");
    setQuery("");
    setDepartment("");
  };
  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(({ filter: f, label, icon: Icon, tone, count }, i) => {
          const pressed = filter === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={pressed}
              onClick={() => setFilter(pressed ? "all" : f)}
              className={cn(
                "rounded-2xl border bg-card p-4 text-left shadow-card transition-all active:scale-[0.98]",
                pressed ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40",
                i === tiles.length - 1 && "col-span-2 md:col-span-1",
              )}
            >
              <span className={cn("grid size-9 place-items-center rounded-xl", toneClasses[tone].soft)}>
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="mt-3 block text-3xl font-semibold leading-none tracking-tight tabular-nums">{counts[count]}</span>
              <span className="mt-1.5 block text-sm text-muted-foreground">{label}</span>
            </button>
          );
        })}
      </div>

      {entries.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">Search by name or code</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code"
              className="block h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-base sm:h-10 sm:text-sm"
            />
          </label>
          {departments.length > 1 ? (
            <label>
              <span className="sr-only">Department</span>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="block h-11 rounded-xl border border-input bg-card px-3 text-base sm:h-10 sm:text-sm"
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {narrowed ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-primary hover:bg-accent sm:h-10"
            >
              <X className="size-4" aria-hidden />
              Show everyone
            </button>
          ) : null}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <Card className="border-dashed text-sm text-muted-foreground shadow-none">
          No employees yet.{" "}
          <Link href="/employees" className="font-medium text-primary underline underline-offset-2">
            Add your team on the Employees screen
          </Link>{" "}
          and today will fill in as they punch.
        </Card>
      ) : visible.length === 0 ? (
        <Card className="text-sm text-muted-foreground">
          Nobody matches{active ? ` "${active.label.toLowerCase()}"` : ""}
          {needle ? ` and "${query.trim()}"` : ""}.{" "}
          <button type="button" onClick={clear} className="font-medium text-primary underline underline-offset-2">
            Show everyone
          </button>
        </Card>
      ) : filter === "all" ? (
        sections.map(({ group, title, hint, icon }) => {
          const rows = visible.filter((e) => e.group === group);
          if (rows.length === 0) return null;
          return (
            <Card key={group}>
              <CardTitle icon={icon} count={rows.length}>
                {title}
              </CardTitle>
              {hint ? <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p> : null}
              <ul className="mt-2 divide-y divide-border">
                {rows.map((entry) => (
                  <Row key={entry.id} entry={entry} date={date} open={openId === entry.id} onToggle={() => toggle(entry.id)} />
                ))}
              </ul>
            </Card>
          );
        })
      ) : (
        <Card>
          <CardTitle icon={active?.icon} count={visible.length}>
            {active?.label}
          </CardTitle>
          <ul className="mt-2 divide-y divide-border">
            {visible.map((entry) => (
              <Row key={entry.id} entry={entry} date={date} open={openId === entry.id} onToggle={() => toggle(entry.id)} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
