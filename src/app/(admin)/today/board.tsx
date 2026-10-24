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
import { Card } from "@/components/ui/card";
import { Ring, type RingSegment } from "@/components/ui/ring";
import type { Tone } from "@/components/ui/tone";
import type { TodayGroup } from "@/lib/attendance/today";
import { cn } from "@/lib/utils";

import { LiveRefresh } from "./live-refresh";

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

export type BoardHero = {
  /** "Today, Sun 25 Oct 2026", with holiday or weekly off day when it is one. */
  title: string;
  headline: string;
  expected: number;
  /** When the server built the page, in milliseconds. */
  generatedAt: number;
  segments: RingSegment[];
};

type Filter = "all" | "in" | "late" | "not_in_yet" | "absent" | "on_leave";

const matches: Record<Filter, (entry: BoardEntry) => boolean> = {
  all: () => true,
  in: (e) => e.group === "in" || e.group === "worked_off_day",
  late: (e) => e.group === "in" && e.late,
  not_in_yet: (e) => e.group === "not_in_yet",
  absent: (e) => e.group === "absent",
  on_leave: (e) => e.group === "on_leave",
};

const chips: { filter: Exclude<Filter, "all">; label: string; icon: LucideIcon; count: keyof BoardCounts }[] = [
  { filter: "in", label: "In", icon: UserCheck, count: "in" },
  { filter: "late", label: "Late", icon: AlarmClock, count: "late" },
  { filter: "not_in_yet", label: "Not in yet", icon: Hourglass, count: "notInYet" },
  { filter: "absent", label: "Absent", icon: UserX, count: "absent" },
  { filter: "on_leave", label: "On leave", icon: Plane, count: "onLeave" },
];

const sections: { group: TodayGroup; title: string; hint?: string; icon: LucideIcon }[] = [
  { group: "absent", title: "Absent", hint: "No punch, and the shift is over", icon: UserX },
  { group: "not_in_yet", title: "Not in yet", hint: "No punch so far, shift not over", icon: Hourglass },
  { group: "in", title: "In", icon: UserCheck },
  { group: "worked_off_day", title: "Came in on a day off", icon: CalendarOff },
  { group: "on_leave", title: "On leave", icon: Plane },
];

function Row({ entry, date, open, onToggle }: { entry: BoardEntry; date: string; open: boolean; onToggle: () => void }) {
  const panelId = `punches-${entry.id}`;
  // Everyone not in yet has the same story, so the shift time waits in the opened row on phones.
  const quietOnPhone = entry.group === "not_in_yet" || entry.group === "absent";
  return (
    <li className={cn("border-b border-border/60", open && "xl:col-span-2")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-secondary/60"
      >
        <Avatar name={entry.name} className="size-8 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{entry.name}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {entry.empCode}
            {entry.department ? `, ${entry.department}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Badge tone={entry.tone} className="px-2 py-0 text-[11px] leading-5">
            {entry.badge}
          </Badge>
          {entry.detail ? (
            <p className={cn("text-[11px] leading-tight tabular-nums text-muted-foreground", quietOnPhone && "hidden sm:block")}>{entry.detail}</p>
          ) : null}
        </div>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="mb-2 ml-[2.625rem] rounded-xl bg-secondary/70 p-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Punches today</span>
            {entry.punches.length === 0 ? (
              <span className="text-xs text-muted-foreground">None yet, shift {entry.shiftLabel}</span>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {entry.punches.map((time, i) => (
                  <li key={`${time}-${i}`} className="rounded-md bg-card px-1.5 py-0.5 text-xs font-medium tabular-nums shadow-sm">
                    {time}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/attendance/${entry.id}/${date}`} className="ml-auto text-xs font-medium text-primary underline underline-offset-2">
              Open this day
            </Link>
          </div>
          {entry.missingOut ? <p className="mt-1.5 text-xs text-warning">No leaving punch yet.</p> : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The whole Today screen from the hero down, because the filters in the hero
 * and the list below share one state. The tiles filter the list, the search
 * box and department menu narrow it, and each row opens to show that person's
 * punches. `notices` and `aside` are server-rendered and come in from the page.
 */
export function TodayBoard({
  entries,
  counts,
  date,
  hero,
  deviceNote,
  notices,
  aside,
}: {
  entries: BoardEntry[];
  counts: BoardCounts;
  date: string;
  hero: BoardHero;
  deviceNote: React.ReactNode;
  notices: React.ReactNode;
  aside: React.ReactNode;
}) {
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
  const active = chips.find((c) => c.filter === filter);

  const clear = () => {
    setFilter("all");
    setQuery("");
    setDepartment("");
  };
  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));
  const rows = (list: BoardEntry[]) => (
    <ul className="grid xl:grid-cols-2 xl:gap-x-6">
      {list.map((entry) => (
        <Row key={entry.id} entry={entry} date={date} open={openId === entry.id} onToggle={() => toggle(entry.id)} />
      ))}
    </ul>
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4">
      <section className="relative overflow-hidden rounded-2xl bg-forest p-3.5 text-forest-foreground shadow-card sm:rounded-3xl sm:p-5">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-forest-active/40 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <Ring size={88} thickness={10} track="stroke-forest-line" segments={hero.segments}>
            <div>
              <p className="text-2xl font-semibold leading-none tabular-nums">{counts.in}</p>
              <p className="mt-0.5 text-[10px] text-forest-muted">of {hero.expected}</p>
            </div>
          </Ring>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs text-forest-muted">{hero.title}</h1>
            <p className="mt-0.5 text-xl font-semibold leading-tight tracking-tight sm:text-2xl">{hero.headline}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <LiveRefresh generatedAt={hero.generatedAt} />
              {deviceNote}
            </div>
          </div>
        </div>

        <ul className="relative mt-3 grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="Filter the list">
          {chips.map(({ filter: f, label, icon: Icon, count }) => {
            const pressed = filter === f;
            return (
              <li key={f}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setFilter(pressed ? "all" : f)}
                  className={cn(
                    "flex h-full w-full flex-col items-center rounded-xl px-1 py-2 transition-all active:scale-[0.97]",
                    pressed ? "bg-white text-forest shadow-sm" : "bg-forest-line/70 text-forest-foreground hover:bg-forest-line",
                  )}
                >
                  <Icon className={cn("size-3.5", pressed ? "text-forest" : "text-forest-muted")} aria-hidden />
                  <span className="mt-1 text-lg font-semibold leading-none tabular-nums">{counts[count]}</span>
                  <span className={cn("mt-1 text-[11px] leading-none", pressed ? "text-forest" : "text-forest-muted")}>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {notices}

      <div className="grid items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid grid-cols-1 gap-3">
          {entries.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-40 flex-1">
                <span className="sr-only">Search by name or code</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people"
                  className="block h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-base sm:text-sm"
                />
              </label>
              {departments.length > 1 ? (
                <label>
                  <span className="sr-only">Department</span>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="block h-10 rounded-xl border border-input bg-card px-3 text-base sm:text-sm"
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
                  className="inline-flex h-10 items-center gap-1 rounded-xl px-2.5 text-sm font-medium text-primary hover:bg-accent"
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
          ) : (
            <Card className="p-3 sm:p-4">
              {filter === "all" ? (
                sections.map(({ group, title, hint, icon: Icon }) => {
                  const list = visible.filter((e) => e.group === group);
                  if (list.length === 0) return null;
                  return (
                    <section key={group} className="first:-mt-1 [&:not(:first-child)]:mt-3">
                      <h2 className="flex items-center gap-2 pb-1 text-sm font-semibold">
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        {title}
                        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{list.length}</span>
                        {hint ? <span className="hidden truncate text-xs font-normal text-muted-foreground sm:inline">{hint}</span> : null}
                      </h2>
                      {rows(list)}
                    </section>
                  );
                })
              ) : (
                <section>
                  <h2 className="flex items-center gap-2 pb-1 text-sm font-semibold">
                    {active ? <active.icon className="size-4 text-muted-foreground" aria-hidden /> : null}
                    {active?.label}
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{visible.length}</span>
                  </h2>
                  {rows(visible)}
                </section>
              )}
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:sticky lg:top-6">{aside}</div>
      </div>
    </div>
  );
}
