import { describe, expect, it } from "vitest";

import { buildCandidates, fetchGoogleFeed, GOOGLE_FEED_URL, parseIcs, parsePastedList } from "@/lib/settings/holiday-import";

const ICS = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261216",
  "DTEND;VALUE=DATE:20261217",
  "DESCRIPTION:Public holiday",
  "SUMMARY:Victory Day",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260319",
  "DTEND;VALUE=DATE:20260322",
  "DESCRIPTION:Public holiday\\nTo hide observances\\, go to Google Calendar Setting",
  " s > Holidays in Bangladesh",
  "SUMMARY:Eid ul-Fitr Holiday",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260523",
  "DTEND;VALUE=DATE:20260524",
  "DESCRIPTION:Observance",
  "SUMMARY:Working Day",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260501",
  "DESCRIPTION:Public holiday",
  "SUMMARY:May Day",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260501",
  "DESCRIPTION:Public holiday",
  "SUMMARY:Buddha Purnima\\, Vesak",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261225",
  "DESCRIPTION:Observance",
  "SUMMARY:Boxing Day",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "SUMMARY:No date at all",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  it("reads days off and observances, with escaped text and folded lines", () => {
    const events = parseIcs(ICS);
    expect(events).toContainEqual({ date: "2026-12-16", name: "Victory Day", kind: "holiday" });
    expect(events).toContainEqual({ date: "2026-12-25", name: "Boxing Day", kind: "observance" });
    expect(events).toContainEqual({ date: "2026-05-01", name: "Buddha Purnima, Vesak", kind: "holiday" });
  });

  it("turns a run of days into one event a day, the end date being the day after the last", () => {
    const eid = parseIcs(ICS).filter((e) => e.name === "Eid ul-Fitr Holiday").map((e) => e.date);
    expect(eid).toEqual(["2026-03-19", "2026-03-20", "2026-03-21"]);
  });

  it("skips an event with no date, and reads an empty file as nothing", () => {
    expect(parseIcs(ICS).some((e) => e.name === "No date at all")).toBe(false);
    expect(parseIcs("")).toEqual([]);
  });

  it("reads a date and time value as the date", () => {
    const events = parseIcs("BEGIN:VEVENT\nDTSTART:20270101T000000Z\nSUMMARY:New Year\nEND:VEVENT");
    expect(events).toEqual([{ date: "2027-01-01", name: "New Year", kind: "observance" }]);
  });
});

describe("parsePastedList", () => {
  it("reads the usual ways of writing a date and a name", () => {
    const { events, problems } = parsePastedList(
      [
        "2026-12-16 Victory Day",
        "16/12/2026, Victory Day again",
        "25 Dec 2026 - Christmas Day",
        "Thursday, 26 March 2026: Independence Day",
        "Dec 24, 2026 Christmas Eve",
        "1.5.2026 May Day",
      ].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(events.map((e) => `${e.date} ${e.name}`)).toEqual([
      "2026-12-16 Victory Day",
      "2026-12-16 Victory Day again",
      "2026-12-25 Christmas Day",
      "2026-03-26 Independence Day",
      "2026-12-24 Christmas Eve",
      "2026-05-01 May Day",
    ]);
    expect(events.every((e) => e.kind === "holiday")).toBe(true);
  });

  it("hands back the lines it cannot read, and skips blank lines", () => {
    const { events, problems } = parsePastedList("\n2026-02-30 Not a date\nVictory Day\n2026-12-16\n2026-12-16 Victory Day\n");
    expect(events).toHaveLength(1);
    expect(problems).toEqual(["2026-02-30 Not a date", "Victory Day", "2026-12-16"]);
  });
});

describe("buildCandidates", () => {
  const events = parseIcs(ICS);
  const base = { year: 2026, existingDates: new Set<string>(), weeklyOffDays: [5, 6], today: "2026-04-01" };

  it("keeps one row a date, joins two names on one day, and leaves out Working Day", () => {
    const rows = buildCandidates(events, base);
    expect(rows.map((r) => r.date)).toEqual([...new Set(rows.map((r) => r.date))]);
    expect(rows.find((r) => r.date === "2026-05-01")?.name).toBe("May Day and Buddha Purnima, Vesak");
    expect(rows.some((r) => r.name === "Working Day")).toBe(false);
  });

  it("only offers the year asked for, in date order", () => {
    const rows = buildCandidates(events, { ...base, year: 2027 });
    expect(rows).toEqual([]);
    const dates = buildCandidates(events, base).map((r) => r.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("ticks days off still to come, and nothing else", () => {
    const rows = buildCandidates(events, base);
    const byDate = Object.fromEntries(rows.map((r) => [r.date, r]));
    // A Wednesday in December: a day off still to come.
    expect(byDate["2026-12-16"]).toMatchObject({ kind: "holiday", selected: true, past: false, onWeeklyOff: false, alreadyAdded: false });
    // Before today.
    expect(byDate["2026-03-19"]).toMatchObject({ kind: "holiday", past: true, selected: false });
    // An observance, not a day off.
    expect(byDate["2026-12-25"]).toMatchObject({ kind: "observance", selected: false });
  });

  it("marks a date that already has a holiday and leaves it unticked", () => {
    const rows = buildCandidates(events, { ...base, existingDates: new Set(["2026-12-16"]) });
    expect(rows.find((r) => r.date === "2026-12-16")).toMatchObject({ alreadyAdded: true, selected: false });
  });

  it("does not tick a day off that falls on a weekly off day", () => {
    const friday = buildCandidates([{ date: "2026-12-25", name: "Christmas Day", kind: "holiday" }], base)[0];
    expect(friday).toMatchObject({ onWeeklyOff: true, selected: false });
  });
});

describe("fetchGoogleFeed", () => {
  const answer = (body: string, status = 200): typeof fetch => async () => new Response(body, { status });

  it("returns the calendar, asking Google's public address", async () => {
    let asked = "";
    const spy: typeof fetch = async (input) => {
      asked = String(input);
      return new Response(ICS);
    };
    expect(await fetchGoogleFeed(spy)).toEqual({ ok: true, text: ICS });
    expect(asked).toBe(GOOGLE_FEED_URL);
    expect(new URL(asked).hostname).toBe("calendar.google.com");
  });

  it("says so in plain words when Google does not answer, answers badly, or sends something else", async () => {
    expect(await fetchGoogleFeed(answer("", 503))).toMatchObject({ ok: false, error: expect.stringContaining("paste your own list") });
    expect(await fetchGoogleFeed(answer("<html>sign in</html>"))).toMatchObject({ ok: false, error: expect.stringContaining("Paste your own list") });
    const down: typeof fetch = async () => {
      throw new Error("offline");
    };
    expect(await fetchGoogleFeed(down)).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});
