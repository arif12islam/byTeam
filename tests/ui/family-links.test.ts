import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FamilyLinks } from "@/components/family-links";
import { allNavItems, familyApps, primaryTabHrefs } from "@/components/nav";

describe("the byTeam family links", () => {
  for (const variant of ["sidebar", "sheet"] as const) {
    it(`links to byBlock in a new tab in the ${variant}, safely, and never as the current page`, () => {
      const markup = renderToStaticMarkup(createElement(FamilyLinks, { variant }));
      expect(markup).toContain('href="https://byblock.bykorp.com"');
      expect(markup).toContain('target="_blank"');
      expect(markup).toContain('rel="noopener noreferrer"');
      expect(markup).toContain("byBlock");
      expect(markup).toContain("Sales and reservations");
      expect(markup).toContain("opens in a new tab");
      expect(markup).toContain("byTeam family");
      expect(markup).not.toContain("aria-current");
      expect(markup).not.toContain("—");
    });
  }

  it("keeps other apps apart from the screens of this one", () => {
    for (const app of familyApps) {
      expect(app.url.startsWith("https://")).toBe(true);
      expect(allNavItems.some((item) => item.href === app.url)).toBe(false);
    }
    expect(allNavItems.every((item) => item.href.startsWith("/"))).toBe(true);
    for (const href of primaryTabHrefs) expect(allNavItems.some((item) => item.href === href)).toBe(true);
  });
});
