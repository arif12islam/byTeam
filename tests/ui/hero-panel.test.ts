import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroPanel } from "@/components/ui/hero-panel";

describe("HeroPanel", () => {
  it("draws the soft brand tint with a brand border", () => {
    const html = renderToStaticMarkup(createElement(HeroPanel, {}, "Body"));
    expect(html).toContain("border-brand-border");
    expect(html).toContain("from-brand-soft");
    expect(html).toContain("to-card");
    expect(html).toContain("rounded-2xl");
    expect(html).toContain("Body");
  });

  it("shows the eyebrow, title and actions when given", () => {
    const html = renderToStaticMarkup(
      createElement(HeroPanel, { eyebrow: "October 2026", title: "Payroll", actions: createElement("button", null, "Export") }, "Body"),
    );
    expect(html).toContain("October 2026");
    expect(html).toContain("<h2");
    expect(html).toContain("Payroll");
    expect(html).toContain("Export");
  });

  it("leaves out the header when there is nothing for it", () => {
    const html = renderToStaticMarkup(createElement(HeroPanel, {}, "Body"));
    expect(html).not.toContain("<h2");
  });

  it("accepts an extra class", () => {
    expect(renderToStaticMarkup(createElement(HeroPanel, { className: "mt-6" }, "x"))).toContain("mt-6");
  });
});
