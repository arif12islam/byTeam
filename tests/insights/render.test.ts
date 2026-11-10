import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DailyCard } from "@/components/insights/daily-card";
import { DepartmentCard, PayrollCard } from "@/components/insights/department-and-payroll";
import { DeviceHealthCard } from "@/components/insights/device-health";
import { actionLabel } from "@/components/insights/fact-list";
import { HeadlineTiles } from "@/components/insights/headline-tiles";
import { InsightsSkeleton } from "@/components/insights/insights-skeleton";
import { LeaveLowCard } from "@/components/insights/leave-low";
import { PeopleLists } from "@/components/insights/people-lists";
import { WeekdayLatesCard } from "@/components/insights/weekday-lates";
import { WorthALook } from "@/components/insights/worth-a-look";
import { buildInsights } from "@/lib/insights/facts";
import { buildSummary } from "@/lib/insights/summary";

import { absent, input, late, lates, person } from "./fixtures";

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

const busy = input({
  current: [
    person("a", "Rahim Uddin", "2026-11", { ...lates(0), 8: late, 9: late, 10: late, 11: late }, 12),
    person("b", "Karim Ali", "2026-11", { 10: absent, 11: absent }, 12),
    person("c", "Salma Begum", "2026-11", {}, 12),
  ],
  previous: [person("a", "Rahim Uddin", "2026-10", {}, 31), person("b", "Karim Ali", "2026-10", {}, 31), person("c", "Salma Begum", "2026-10", {}, 31)],
  balances: [{ employeeId: "c", quota: 14, remaining: 1, employeeName: "Salma Begum", leaveTypeName: "Casual" }],
  payroll: [
    { month: "2026-10", net: 120_000, people: 3 },
    { month: "2026-09", net: 100_000, people: 3 },
  ],
});
const full = buildSummary(busy);
const empty = buildSummary(input());
const noEmDash = (markup: string) => expect(markup).not.toContain("—");

describe("the Insights page, with data", () => {
  it("shows the facts with the tone in words, the person and where tapping goes", () => {
    const markup = html(createElement(WorthALook, { facts: buildInsights(busy).facts }));
    expect(markup).toContain("Problem");
    expect(markup).toContain("Open the day");
    expect(markup).toContain("/attendance/b/2026-11-10?from=person");
    expect(markup).toContain("RU");
    noEmDash(markup);
  });

  it("shows the four numbers with words, not only colour", () => {
    const markup = html(createElement(HeadlineTiles, { headline: full.headline }));
    for (const label of ["Attendance", "Lates", "Absences", "In today"]) expect(markup).toContain(label);
    expect(markup).toContain("at this point last month");
    noEmDash(markup);
  });

  it("draws the days with a table behind it", () => {
    const markup = html(createElement(DailyCard, { points: full.daily, month: full.month }));
    expect(markup).toContain("Show as table");
    expect(markup).toContain("On time");
    expect(markup).toContain('role="img"');
  });

  it("lists people with a link to their calendar", () => {
    const markup = html(createElement(PeopleLists, full.people));
    expect(markup).toContain("/attendance/c?month=2026-11");
    expect(markup).toContain("Most on time");
    expect(markup).toContain("Most lates and absences");
    expect(markup).toContain("2 absences");
  });

  it("shows low leave, the weekday bars, the payroll change and the device card", () => {
    expect(html(createElement(LeaveLowCard, { rows: full.leaveLow }))).toContain("1 of 14 days left");
    expect(html(createElement(WeekdayLatesCard, { weekdays: full.weekdays }))).toContain("Show as table");
    const pay = html(createElement(PayrollCard, { trend: full.payroll }));
    expect(pay).toContain("20% higher than the month before");
    expect(pay).toContain("/payroll?month=2026-10");
    expect(html(createElement(DeviceHealthCard, full.devices))).toContain("No unlinked codes");
  });
});

describe("the Insights page, with nothing yet", () => {
  it("says what is missing instead of drawing an empty chart", () => {
    expect(html(createElement(WorthALook, { facts: [] }))).toContain("Nothing unusual so far");
    expect(html(createElement(DailyCard, { points: empty.daily, month: empty.month }))).toContain("No working days yet this month");
    expect(html(createElement(WeekdayLatesCard, { weekdays: empty.weekdays }))).toContain("No lates in the last two months");
    const lists = html(createElement(PeopleLists, empty.people));
    expect(lists).toContain("Nobody yet");
    expect(lists).toContain("No lates or absences this month");
    expect(html(createElement(LeaveLowCard, { rows: empty.leaveLow }))).toContain("Everyone has enough leave left");
    expect(html(createElement(DeviceHealthCard, empty.devices))).toContain("No device added yet");
    expect(html(createElement(PayrollCard, { trend: empty.payroll }))).toContain("after two payroll runs");
    expect(html(createElement(HeadlineTiles, { headline: empty.headline }))).toContain("No working days yet this month");
  });

  it("has a department card only when there is something to compare", () => {
    expect(empty.departments).toBeNull();
    const markup = html(createElement(DepartmentCard, { rows: [{ department: "Sales", people: 2, present: 8, late: 1, absent: 2, leave: 0, rate: 0.8 }, { department: "Ops", people: 1, present: 5, late: 0, absent: 0, leave: 0, rate: 1 }] }));
    expect(markup).toContain("80%");
    expect(markup).toContain("100%");
  });

  it("has a loading skeleton marked busy", () => {
    expect(html(createElement(InsightsSkeleton))).toContain('aria-busy="true"');
  });
});

describe("actionLabel", () => {
  it("says where tapping goes", () => {
    expect(actionLabel("/attendance/abc/2026-11-10?from=person")).toBe("Open the day");
    expect(actionLabel("/attendance/abc?month=2026-11")).toBe("Open calendar");
    expect(actionLabel("/attendance?month=2026-11")).toBe("Open attendance");
    expect(actionLabel("/devices")).toBe("Open devices");
    expect(actionLabel("/payroll?month=2026-10")).toBe("Open payroll");
    expect(actionLabel("/employees/new?code=23")).toBe("Add employee");
    expect(actionLabel("/leave")).toBe("Open leave");
  });
});
