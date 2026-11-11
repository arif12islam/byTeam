import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HeroStat } from "@/components/ui/hero-stat";

describe("HeroStat", () => {
  it("shows the label, number and hint", () => {
    const html = renderToStaticMarkup(createElement(HeroStat, { label: "On leave today", value: 3, hint: "Requests cover today" }));
    expect(html).toContain("On leave today");
    expect(html).toContain(">3<");
    expect(html).toContain("Requests cover today");
    expect(html).not.toContain("rounded-full");
  });

  it("draws a status dot for a tone, with the word beside it", () => {
    const html = renderToStaticMarkup(createElement(HeroStat, { label: "Late", value: 2, tone: "warning" }));
    expect(html).toContain("bg-amber-400");
    expect(html).toContain("Late");
  });
});
