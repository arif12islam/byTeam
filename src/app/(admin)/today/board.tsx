"use client";

import {
  AlarmClock,
  CalendarOff,
  ChevronRight,
  Hourglass,
  Plane,
  Search,
  UserCheck,
  UserX,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Ring, type RingSegment } from "@/components/ui/ring";
import { toneClasses, type Tone } from "@/components/ui/tone";
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

const chips: { filter: Exclude<Filter, "all">; label: string; short?: string; icon: LucideIcon; count: keyof BoardCounts; tone: Tone }[] = [
  { filter: "in", label: "In", icon: UserCheck, count: "in", tone: "success" },
  { filter: "late", label: "Late", icon: AlarmClock, count: "late", tone: "warning" },
  { filter: "not_in_yet", label: "Not in yet", short: "Not in", icon: Hourglass, count: "notInYet", tone: "off" },
  { filter: "absent", label: "Absent", icon: UserX, count: "absent", tone: "danger" },
  { filter: "on_leave", label: "On leave", icon: Plane, count: "onLeave", tone: "info" },
];

const sections: { group: TodayGroup; title: string; hint?: string; icon: LucideIcon }[] = [
  { group: "absent", title: "Absent", hint: "No punch, and the shift is over", icon: UserX },
  { group: "not_in_yet", title: "Not in yet", hint: "No punch so far, shift not over", icon: Hourglass },
  { group: "in", title: "In", icon: UserCheck },
  { group: "worked_off_day", title: "Came in on a day off", icon: CalendarOff },
  { group: "on_leave", title: "On leave", icon: Plane },
];

function Row({ entry, onOpen }: { entry: BoardEntry; onOpen: (entry: BoardEntry, trigger: HTMLElement) => void }) {
  // Everyone not in yet has the same story, so the shift time waits in the sheet on phones.
  const quietOnPhone = entry.group === "not_in_yet" || entry.group === "absent";
  return (
    <li className="border-b border-border/60">
      <button
        type="button"
        onClick={(event) => onOpen(entry, event.currentTarget)}
        aria-haspopup="dialog"
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
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

/**
 * One person's day, floating over the page: a sheet from the bottom on a
 * phone, a card in the middle on a bigger screen. It opens over the list
 * instead of inside it, so nothing behind it moves.
 */
function PersonSheet({ entry, date, onClose }: { entry: BoardEntry; date: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={entry.name}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-card p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card md:inset-auto md:left-1/2 md:top-1/2 md:w-[26rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:p-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
        <div className="flex items-center gap-3">
          <Avatar name={entry.name} className="size-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{entry.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              Code {entry.empCode}
              {entry.department ? `, ${entry.department}` : ""}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary hover:bg-secondary/70"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={entry.tone}>{entry.badge}</Badge>
          {entry.detail ? <span className="text-sm tabular-nums text-muted-foreground">{entry.detail}</span> : null}
        </div>

        <dl className="mt-4 grid gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Shift</dt>
            <dd className="mt-0.5">{entry.shiftLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Punches today</dt>
            <dd className="mt-1">
              {entry.punches.length === 0 ? (
                <span className="text-muted-foreground">None yet</span>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {entry.punches.map((time, i) => (
                    <li key={`${time}-${i}`} className="rounded-lg bg-secondary px-2 py-1 text-sm font-medium tabular-nums">
                      {time}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
        {entry.missingOut ? <p className="mt-3 text-sm text-warning">No leaving punch yet.</p> : null}

        <Link href={`/attendance/${entry.id}/${date}`} className={cn(buttonVariants({ variant: "outline" }), "mt-5 w-full")}>
          Open this day
        </Link>
      </div>
    </div>
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
  // The person whose sheet is open, and the row to give focus back to when it closes.
  const [selected, setSelected] = useState<{ id: string; trigger: HTMLElement } | null>(null);

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

  // Read from the latest data, so a live refresh updates an open sheet.
  const selectedEntry = selected ? entries.find((e) => e.id === selected.id) : undefined;

  const clear = () => {
    setFilter("all");
    setQuery("");
    setDepartment("");
  };
  const open = (entry: BoardEntry, trigger: HTMLElement) => setSelected({ id: entry.id, trigger });
  const close = () => {
    selected?.trigger.focus();
    setSelected(null);
  };
  const rows = (list: BoardEntry[]) => (
    <ul className="grid xl:grid-cols-2 xl:gap-x-6">
      {list.map((entry) => (
        <Row key={entry.id} entry={entry} onOpen={open} />
      ))}
    </ul>
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex items-center gap-4">
          <Ring size={76} thickness={7} track="stroke-secondary" segments={hero.segments}>
            <div>
              <p className="text-lg font-semibold leading-none tabular-nums">{counts.in}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">of {hero.expected}</p>
            </div>
          </Ring>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs text-muted-foreground">{hero.title}</h1>
            <p className="mt-0.5 text-xl font-semibold tracking-tight">{hero.headline}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              <LiveRefresh generatedAt={hero.generatedAt} />
              {deviceNote}
            </div>
          </div>
        </div>

        <ul className="mt-4 grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="Filter the list">
          {chips.map(({ filter: f, label, short, count, tone }) => {
            const pressed = filter === f;
            return (
              <li key={f}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setFilter(pressed ? "all" : f)}
                  className={cn(
                    "flex h-full w-full flex-col items-start rounded-lg border px-2 py-2 text-left sm:px-2.5 transition-colors",
                    pressed ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary/60",
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className="text-lg font-semibold leading-none tabular-nums">{counts[count]}</span>
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneClasses[tone].solid)} />
                  </span>
                  <span className={cn("mt-1.5 w-full truncate text-[11px] leading-none tracking-tight sm:tracking-normal", pressed ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {short ? (
                      <>
                        <span className="sm:hidden">{short}</span>
                        <span className="hidden sm:inline">{label}</span>
                      </>
                    ) : (
                      label
                    )}
                  </span>
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
            <div>
              <div className="flex items-center gap-2">
                <label className="relative min-w-0 flex-1">
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
                  <label className="w-44 shrink-0 sm:w-48">
                    <span className="sr-only">Department</span>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="block h-10 w-full rounded-xl border border-input bg-card px-3 text-base sm:text-sm"
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
              </div>
              {/* A line of fixed height: the count is always there and the reset button only fades in, so the list below never jumps. */}
              <div className="mt-1.5 flex h-7 items-center justify-between px-1 text-xs text-muted-foreground">
                <span role="status" className="tabular-nums">
                  Showing {visible.length} of {entries.length} {entries.length === 1 ? "person" : "people"}
                </span>
                <button
                  type="button"
                  onClick={clear}
                  tabIndex={narrowed ? 0 : -1}
                  aria-hidden={!narrowed}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-lg px-2 font-medium text-primary transition-opacity hover:bg-accent",
                    narrowed ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <X className="size-3.5" aria-hidden />
                  Show everyone
                </button>
              </div>
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
      {selectedEntry ? <PersonSheet entry={selectedEntry} date={date} onClose={close} /> : null}
    </div>
  );
}
