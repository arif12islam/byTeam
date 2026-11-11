import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TabLinks } from "@/components/ui/tab-links";

const tabs = [
  { href: "/leave?tab=requests", label: "Requests", count: 3 },
  { href: "/leave?tab=balances", label: "Balances" },
];
const html = (active: string) => renderToStaticMarkup(createElement(TabLinks, { tabs, active, ariaLabel: "Leave sections" }));

describe("TabLinks", () => {
  it("renders each tab as a link", () => {
    const out = html(tabs[0].href);
    expect(out).toContain('href="/leave?tab=requests"');
    expect(out).toContain('href="/leave?tab=balances"');
    expect(out).toContain('aria-label="Leave sections"');
  });

  it("marks only the active tab as the current page", () => {
    const out = html(tabs[1].href);
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-current="page"[^>]*>Balances/);
  });

  it("underlines the active tab in brand and keeps a 40px target", () => {
    const out = html(tabs[0].href);
    expect(out).toContain("border-brand");
    expect(out).toContain("min-h-10");
  });

  it("shows a count only when given, and scrolls sideways", () => {
    const out = html(tabs[0].href);
    expect(out).toContain(">3<");
    expect(out).toContain("overflow-x-auto");
    expect(out.match(/tabular-nums/g)).toHaveLength(1);
  });
});
