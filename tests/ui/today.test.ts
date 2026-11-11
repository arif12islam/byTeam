import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ArrivalsChart } from "@/app/(admin)/today/arrivals-chart";
import { TodayBoard, type BoardEntry, type BoardHero } from "@/app/(admin)/today/board";
import { PunchFeed } from "@/app/(admin)/today/punch-feed";
import { TodaySkeleton } from "@/app/(admin)/today/today-skeleton";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, back: () => undefined }) }));

const entry = (over: Partial<BoardEntry>): BoardEntry => ({
  id: "a",
  empCode: "1001",
  name: "Rahim Uddin",
  department: "Sales",
  group: "in",
  late: false,
  tone: "success",
  time: "08:50",
  badge: null,
  note: "On time",
  noteWarns: false,
  out: "Not out yet",
  detail: "In 08:50, not out yet",
  shiftLabel: "09:00 to 18:00",
  punches: ["08:50"],
  missingOut: true,
  ...over,
});

const hero: BoardHero = {
  dateLine: "Wednesday, 11 Nov 2026",
  inCount: 1,
  due: 3,
  percent: 33,
  subline: "2 not in yet, 1 past their start time",
  allGood: false,
  generatedAt: 0,
  segments: [
    { value: 1, tone: "success", label: "On time" },
    { value: 2, tone: "off", label: "Not in yet" },
  ],
};

const board = (entries: BoardEntry[]) =>
  renderToStaticMarkup(
    createElement(TodayBoard, {
      entries,
      counts: { in: 1, late: 0, notInYet: 2, absent: 0, onLeave: 0 },
      date: "2026-11-11",
      hero,
      deviceNote: null,
      notices: null,
      insights: null,
      aside: null,
    }),
  );

describe("the Today screen", () => {
  const people = [
    entry({}),
    entry({ id: "b", name: "Karim Ali", group: "not_in_yet", tone: "warning", time: null, note: "40 min past start", noteWarns: true, out: null, detail: "Due 09:00, 40 min past start", punches: [] }),
    entry({ id: "c", name: "Salma Begum", group: "not_in_yet", tone: "off", time: null, note: "Due 10:00", out: null, detail: "Due 10:00", punches: [] }),
  ];
  const markup = board(people);

  it("has a title, the date and the number that matters", () => {
    expect(markup).toContain("<h1");
    expect(markup).toContain(">Today</h1>");
    expect(markup).toContain("Wednesday, 11 Nov 2026");
    expect(markup).toContain("of 3 in");
    expect(markup).toContain("33%");
    expect(markup).toContain("2 not in yet, 1 past their start time");
  });

  it("has five status filters as pressable buttons, with their full names", () => {
    expect(markup.match(/aria-pressed="false"/g)?.length).toBeGreaterThanOrEqual(5);
    for (const label of ["In", "Late", "Not in yet", "Absent", "On leave"]) expect(markup).toContain(`>${label}</span>`);
    expect(markup).toContain('aria-label="Filter by status"');
  });

  it("says what is particular to each person, not the group name again", () => {
    expect(markup).toContain("40 min past start");
    expect(markup).toContain("Due 10:00");
    expect(markup).toContain("08:50");
    // "Not in yet" is the filter, the group heading and the ring's description, never a badge on each of the two rows.
    expect(markup.match(/Not in yet/g)).toHaveLength(3);
    expect(markup).not.toContain("—");
  });

  it("tells you what to do when there is nobody yet", () => {
    const empty = board([]);
    expect(empty).toContain("No one to show yet");
    expect(empty).toContain('href="/employees/new"');
    expect(empty).not.toContain("Search people");
  });
});

describe("the side cards", () => {
  it("marks the shift start on the arrivals chart and sums it up", () => {
    const markup = renderToStaticMarkup(
      createElement(ArrivalsChart, {
        buckets: [
          { label: "08:45", count: 2, late: 0 },
          { label: "09:00", count: 0, late: 0 },
          { label: "09:15", count: 1, late: 1 },
        ],
        stats: { total: 3, first: "08:50", median: "08:56", late: 1 },
        startLabel: "09:00",
      }),
    );
    expect(markup).toContain("09:00 start");
    expect(markup).toContain("First in");
    expect(markup).toContain("The shift starts at 09:00.");
    expect(markup).toContain("Late");
  });

  it("shows each punch with its line, and an empty state", () => {
    const now = new Date("2026-11-11T04:00:00Z");
    const markup = renderToStaticMarkup(
      createElement(PunchFeed, { now, items: [{ empCode: "1001", name: "Rahim Uddin", at: new Date("2026-11-11T02:50:00Z"), kind: "arrived" as const, deviceName: "Front door", line: "Arrived, on time" }] }),
    );
    expect(markup).toContain("Arrived, on time");
    expect(markup).not.toContain("Front door");
    expect(renderToStaticMarkup(createElement(PunchFeed, { now, items: [] }))).toContain("No punches yet today");
  });

  it("has a loading skeleton marked busy", () => {
    expect(renderToStaticMarkup(createElement(TodaySkeleton))).toContain('aria-busy="true"');
  });
});
