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
  /** Arrival time as HH:MM, for people who are in. */
  time: string | null;
  /** A status that needs to stand out: late, absent, on leave. */
  badge: string | null;
  /** Quiet words on the right: "On time", "Due 09:00", "40 min past start". */
  note: string | null;
  /** The note is something to act on. */
  noteWarns: boolean;
  /** "Out 18:05" or "Not out yet". */
  out: string | null;
  /** The whole story in one line, for the sheet. */
  detail: string;
  shiftLabel: string;
  /** Punch times today as HH:MM, oldest first. */
  punches: string[];
  missingOut: boolean;
};

export type BoardCounts = { in: number; late: number; notInYet: number; absent: number; onLeave: number };

export type BoardHero = {
  /** "Wednesday, 11 Nov", with holiday or weekly off day when it is one. */
  dateLine: string;
  /** People who are in, and how many are due. */
  inCount: number;
  due: number;
  /** In over due, 0 to 100. Null on a day nobody is due. */
  percent: number | null;
  subline: string;
  allGood: boolean;
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

const chips: { filter: Exclude<Filter, "all">; label: string; icon: LucideIcon; count: keyof BoardCounts; tone: Tone }[] = [
  { filter: "in", label: "In", icon: UserCheck, count: "in", tone: "success" },
  { filter: "late", label: "Late", icon: AlarmClock, count: "late", tone: "warning" },
  { filter: "not_in_yet", label: "Not in yet", icon: Hourglass, count: "notInYet", tone: "off" },
  { filter: "absent", label: "Absent", icon: UserX, count: "absent", tone: "danger" },
  { filter: "on_leave", label: "On leave", icon: Plane, count: "onLeave", tone: "info" },
];

const sections: { group: TodayGroup; title: string; hint?: string; icon: LucideIcon }[] = [
  { group: "absent", title: "Absent", hint: "No punch, and the shift is over", icon: UserX },
  { group: "not_in_yet", title: "Not in yet", hint: "No punch so far", icon: Hourglass },
  { group: "in", title: "In", icon: UserCheck },
  { group: "worked_off_day", title: "Came in on a day off", icon: CalendarOff },
  { group: "on_leave", title: "On leave", icon: Plane },
];

/** The right side of a row: what is particular to this person. The group heading already names the group. */
function RowStatus({ entry }: { entry: BoardEntry }) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
      {entry.time ? <p className="text-sm font-semibold leading-tight tabular-nums">{entry.time}</p> : null}
      {entry.badge ? <Badge tone={entry.tone}>{entry.badge}</Badge> : null}
      {entry.note ? (
        <p className={cn("flex items-center gap-1.5 text-xs leading-tight tabular-nums", entry.noteWarns ? "font-medium text-warning" : "text-muted-foreground")}>
          {entry.noteWarns ? <span aria-hidden className={cn("size-1.5 rounded-full", toneClasses.warning.solid)} /> : null}
          {entry.note}
        </p>
      ) : null}
    </div>
  );
}

function Row({ entry, onOpen }: { entry: BoardEntry; onOpen: (entry: BoardEntry, trigger: HTMLElement) => void }) {
  return (
    <li className="border-b border-border/60 last:border-b-0 xl:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
      <button
        type="button"
        onClick={(event) => onOpen(entry, event.currentTarget)}
        aria-haspopup="dialog"
        className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar name={entry.name} className="size-9 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{entry.name}</p>
          <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
            {entry.department ?? `Code ${entry.empCode}`}
            {entry.department ? <span className="hidden sm:inline">, code {entry.empCode}</span> : null}
            {entry.out ? <span className="hidden sm:inline">. {entry.out}</span> : null}
          </p>
        </div>
        <RowStatus entry={entry} />
        <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground md:block" aria-hidden />
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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // Keep Tab inside the sheet while it is open.
      if (event.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    // The page behind stays where it is while the sheet is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-sheet-name"
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-card md:inset-auto md:left-1/2 md:top-1/2 md:w-[26rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" aria-hidden />
        <div className="flex items-center gap-3">
          <Avatar name={entry.name} className="size-12" />
          <div className="min-w-0 flex-1">
            <p id="person-sheet-name" className="truncate text-base font-semibold">
              {entry.name}
            </p>
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
            className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge tone={entry.tone}>{entry.badge ?? (entry.group === "not_in_yet" ? "Not in yet" : (entry.note ?? "In"))}</Badge>
          <span className="text-sm tabular-nums text-muted-foreground">{entry.detail}</span>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Shift</dt>
            <dd className="mt-1 tabular-nums">{entry.shiftLabel}</dd>
          </div>
          {entry.out ? (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Leaving</dt>
              <dd className="mt-1 tabular-nums">{entry.out}</dd>
            </div>
          ) : null}
          <div className="col-span-2">
            <dt className="text-xs font-medium text-muted-foreground">Punches today</dt>
            <dd className="mt-1.5">
              {entry.punches.length === 0 ? (
                <span className="text-muted-foreground">None yet</span>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {entry.punches.map((time, i) => (
                    <li key={`${time}-${i}`} className="rounded-lg bg-secondary px-2.5 py-1 text-sm font-medium tabular-nums">
                      {time}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>

        <Link href={`/attendance/${entry.id}/${date}?from=today`} className={cn(buttonVariants(), "mt-6 h-11 w-full")}>
          Open this day
        </Link>
      </div>
    </div>
  );
}

/**
 * The whole Today screen, because the filters in the hero and the list below
 * share one state. The tiles filter the list, the search box and department
 * menu narrow it, and each row opens to show that person's punches.
 * `notices`, `insights` and `aside` are server-rendered and come in from the page.
 */
export function TodayBoard({
  entries,
  counts,
  date,
  hero,
  deviceNote,
  notices,
  insights,
  aside,
}: {
  entries: BoardEntry[];
  counts: BoardCounts;
  date: string;
  hero: BoardHero;
  deviceNote: React.ReactNode;
  notices: React.ReactNode;
  /** "Worth a look": above the list on a phone, top of the side column on a wide screen. */
  insights: React.ReactNode;
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
    <ul className="grid xl:grid-cols-2 xl:gap-x-8">
      {list.map((entry) => (
        <Row key={entry.id} entry={entry} onOpen={open} />
      ))}
    </ul>
  );
  const groupHeading = (Icon: LucideIcon | undefined, title: string | undefined, count: number, hint?: string) => (
    <h2 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pb-1.5 text-sm font-semibold">
      {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
      {title}
      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
      {hint ? <span className="truncate text-xs font-normal text-muted-foreground">{hint}</span> : null}
    </h2>
  );

  const dayOff = hero.due === 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      <header className="flex items-end justify-between gap-x-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{hero.dateLine}</p>
        </div>
        <LiveRefresh generatedAt={hero.generatedAt} />
      </header>

      {entries.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <p className="text-base font-semibold">No one to show yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Add your team and Today fills in as they punch.</p>
          <Link href="/employees/new" className={cn(buttonVariants(), "mt-4")}>
            Add an employee
          </Link>
        </Card>
      ) : (
        <Card className="p-0 sm:p-0 lg:flex lg:items-stretch">
          <div className="flex items-center gap-4 p-4 sm:gap-6 sm:p-5 lg:w-[27rem] lg:shrink-0">
            <Ring size={96} thickness={9} track="stroke-muted" segments={hero.segments}>
              <div aria-hidden>
                <p className="text-xl font-semibold leading-none tabular-nums">{hero.percent === null ? "-" : `${hero.percent}%`}</p>
                <p className="mt-1 text-[11px] leading-none text-muted-foreground">{hero.percent === null ? "day off" : "in"}</p>
              </div>
            </Ring>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-4xl font-semibold leading-none tracking-tight tabular-nums sm:text-5xl">{hero.inCount}</span>
                <span className="text-base text-muted-foreground sm:text-lg">{dayOff ? (hero.inCount === 1 ? "person in" : "people in") : `of ${hero.due} in`}</span>
              </p>
              <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                {hero.allGood ? <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", toneClasses.success.solid)} /> : null}
                <span>{hero.subline}</span>
              </p>
              {deviceNote ? <div className="mt-1">{deviceNote}</div> : null}
            </div>
          </div>
          {/* Read out when a refresh changes who is in. */}
          <p className="sr-only" aria-live="polite">
            {dayOff ? hero.subline : `${hero.inCount} of ${hero.due} in`}
          </p>

          <ul
            role="group"
            aria-label="Filter by status"
            className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 [scrollbar-width:none] sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible sm:px-5 sm:py-4 lg:flex-1 lg:items-center lg:border-l lg:border-t-0 [&::-webkit-scrollbar]:hidden"
          >
            {chips.map(({ filter: f, label, count, tone }) => {
              const pressed = filter === f;
              const none = counts[count] === 0;
              return (
                <li key={f} className="shrink-0 sm:shrink">
                  <button
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setFilter(pressed ? "all" : f)}
                    className={cn(
                      "flex h-10 w-full items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-auto sm:flex-col sm:items-start sm:gap-2 sm:rounded-lg sm:px-3 sm:py-3",
                      pressed ? "border-foreground bg-secondary" : "border-border hover:bg-secondary/60",
                    )}
                  >
                    <span className={cn("order-last text-sm font-semibold leading-none tabular-nums sm:order-first sm:text-2xl sm:tracking-tight", none && !pressed && "text-muted-foreground")}>
                      {counts[count]}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm leading-none text-muted-foreground sm:text-xs">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", toneClasses[tone].solid)} />
                      <span className={cn(pressed && "font-medium text-foreground")}>{label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {notices}

      {entries.length > 0 ? (
        <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr]">
          {/* On a phone the list matters most, so only the first two facts show above it. */}
          <div className="empty:hidden lg:col-start-2 lg:row-start-1 max-lg:[&_li:nth-child(2)]:border-b-0 max-lg:[&_li:nth-child(n+3)]:hidden">{insights}</div>

          <Card className="p-0 sm:p-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <div className="border-b border-border p-3 pb-1 sm:p-4 sm:pb-1.5">
              <div className="flex items-center gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search by name or code</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setQuery("");
                    }}
                    placeholder="Search people"
                    className="block h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                  />
                </label>
                {departments.length > 1 ? (
                  <label className="w-36 shrink-0 sm:w-48">
                    <span className="sr-only">Department</span>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="block h-10 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
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
              <div className="mt-1 flex h-10 items-center justify-between text-xs text-muted-foreground">
                <span role="status" className="tabular-nums">
                  Showing {visible.length} of {entries.length} {entries.length === 1 ? "person" : "people"}
                </span>
                <button
                  type="button"
                  onClick={clear}
                  tabIndex={narrowed ? 0 : -1}
                  aria-hidden={!narrowed}
                  className={cn(
                    "-mr-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 font-medium text-primary transition-opacity hover:bg-accent",
                    narrowed ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <X className="size-3.5" aria-hidden />
                  Show everyone
                </button>
              </div>
            </div>

            <div className="p-3 sm:p-4">
              {visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nobody matches{active ? ` "${active.label.toLowerCase()}"` : ""}
                  {needle ? `${active ? " and" : ""} "${query.trim()}"` : ""}.{" "}
                  <button type="button" onClick={clear} className="font-medium text-primary underline underline-offset-2">
                    Show everyone
                  </button>
                </p>
              ) : filter === "all" ? (
                sections.map(({ group, title, hint, icon }) => {
                  const list = visible.filter((e) => e.group === group);
                  if (list.length === 0) return null;
                  return (
                    <section key={group} className="[&:not(:first-child)]:mt-5">
                      {groupHeading(icon, title, list.length, hint)}
                      {rows(list)}
                    </section>
                  );
                })
              ) : (
                <section>
                  {groupHeading(active?.icon, active?.label, visible.length)}
                  {rows(visible)}
                </section>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:col-start-2 lg:row-start-2">{aside}</div>
        </div>
      ) : null}
      {selectedEntry ? <PersonSheet entry={selectedEntry} date={date} onClose={close} /> : null}
    </div>
  );
}
