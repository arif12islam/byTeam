import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BalancesTab, describeBalance } from "@/app/(admin)/leave/balances-tab";
import { RequestsTab } from "@/app/(admin)/leave/requests-tab";
import type { Balance } from "@/lib/leave/balances";

// The decision buttons pull in server actions, which a render test does not need.
vi.mock("@/app/(admin)/leave/decision-buttons", () => ({ DecisionButtons: () => null }));

const year = { start: "2026-01-01", end: "2026-12-31" } as unknown as Balance["year"];
const balance = (over: Partial<Balance>): Balance => ({ employeeId: "e1", leaveTypeId: "t1", year, quota: 15, used: 2, pending: 0, remaining: 13, ...over });

describe("describeBalance", () => {
  it("words a limited balance as days left", () => {
    const info = describeBalance(balance({}));
    expect(info?.text).toBe("13 of 15 left");
    expect(info?.over).toBe(false);
    expect(info?.share).toBeCloseTo(2 / 15);
  });
  it("marks a balance below zero", () => {
    const info = describeBalance(balance({ used: 17, remaining: -2 }));
    expect(info?.over).toBe(true);
    expect(info?.share).toBe(1);
  });
  it("words an unlimited type as days taken", () => {
    const info = describeBalance(balance({ quota: null, remaining: null, used: 2 }));
    expect(info?.text).toBe("2 taken");
    expect(info?.limited).toBe(false);
  });
  it("is null with no balance", () => {
    expect(describeBalance(undefined)).toBeNull();
  });
});

describe("BalancesTab", () => {
  it("renders a table and phone cards that carry the person marks", () => {
    const people = [{ id: "e1", name: "Rahim Uddin", empCode: "101", department: "Sales" }];
    const types = [{ id: "t1", name: "Annual" }];
    const html = renderToStaticMarkup(
      createElement(BalancesTab, { people, types, balanceOf: new Map([["e1|t1", balance({})]]), basisNote: "Days left this year." }),
    );
    expect(html).toContain("<table");
    expect(html).toContain("Annual");
    expect(html).toContain("13 of 15 left");
    expect(html.match(/data-person="e1"/g)).toHaveLength(2);
    expect(html).toContain("bg-brand");
  });
});

describe("RequestsTab", () => {
  it("shows a next step in each empty section", () => {
    const html = renderToStaticMarkup(createElement(RequestsTab, { waiting: [], upcoming: [], past: [] }));
    expect(html).toContain("Nothing is waiting");
    expect(html).toContain("Record leave");
    expect(html).toContain("Past");
  });
});
