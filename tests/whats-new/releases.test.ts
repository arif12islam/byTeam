import { existsSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WhatsNewDialog } from "@/components/whats-new/dialog";
import { ReleaseVisual } from "@/components/whats-new/visuals";
import { LATEST_RELEASE, RELEASES, unseenRelease, VISUALS } from "@/lib/whats-new/releases";

const ADMIN = path.join(__dirname, "..", "..", "src", "app", "(admin)");

describe("the release list", () => {
  it("has the newest release first, with unique ids", () => {
    expect(LATEST_RELEASE).toBe(RELEASES[0]);
    expect(new Set(RELEASES.map((r) => r.id)).size).toBe(RELEASES.length);
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const release of RELEASES) expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("gives every item words, two to four steps, a picture that exists and a link that goes somewhere", () => {
    for (const release of RELEASES) {
      expect(release.items.length).toBeGreaterThan(0);
      expect(new Set(release.items.map((i) => i.id)).size).toBe(release.items.length);
      for (const item of release.items) {
        const where = `${release.id}/${item.id}`;
        expect(item.title.trim(), where).not.toBe("");
        expect(item.body.trim(), where).not.toBe("");
        expect(item.steps.length, where).toBeGreaterThanOrEqual(2);
        expect(item.steps.length, where).toBeLessThanOrEqual(4);
        expect(VISUALS, where).toContain(item.visual);
        if (item.href) {
          expect(item.href, where).toMatch(/^\//);
          const route = item.href.split("#")[0].split("?")[0].replace(/^\//, "");
          expect(existsSync(path.join(ADMIN, route, "page.tsx")), `${where} links to ${item.href}`).toBe(true);
        }
      }
    }
  });
});

describe("unseenRelease", () => {
  it("shows the newest release to someone who has not seen it", () => {
    expect(unseenRelease(null)).toBe(LATEST_RELEASE);
    expect(unseenRelease(undefined)).toBe(LATEST_RELEASE);
    expect(unseenRelease("an-older-release")).toBe(LATEST_RELEASE);
  });

  it("shows nothing to someone who has", () => {
    expect(unseenRelease(LATEST_RELEASE.id)).toBeNull();
  });
});

describe("the pictures", () => {
  it("draw for every item, with a numbered marker for each step", () => {
    for (const release of RELEASES) {
      for (const item of release.items) {
        const html = renderToStaticMarkup(createElement(ReleaseVisual, { visual: item.visual }));
        expect(html, item.id).toContain('aria-hidden="true"');
        const markers = new Set([...html.matchAll(/<span class="[^"]*text-primary-foreground[^"]*">(\d)<\/span>/g)].map((m) => Number(m[1])));
        for (let n = 1; n <= item.steps.length; n += 1) expect(markers.has(n), `${item.id} has no marker ${n}`).toBe(true);
      }
    }
  });
});

describe("the tour", () => {
  it("opens on the first step of the release, with a way to skip, step on and try it", () => {
    const html = renderToStaticMarkup(createElement(WhatsNewDialog, { release: LATEST_RELEASE, markSeen: async () => undefined }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(LATEST_RELEASE.items[0].title);
    expect(html).toContain("Skip the tour");
    expect(html).toContain(">Next<");
    expect(html).not.toContain(">Back<");
    expect(html).toContain(LATEST_RELEASE.items[0].steps[0]);
    // One dot per step.
    expect(html.match(/Go to step \d+/g)).toHaveLength(LATEST_RELEASE.items.length);
  });

  it("ends on Done when there is a single step", () => {
    const single = { ...LATEST_RELEASE, items: [LATEST_RELEASE.items[0]] };
    const html = renderToStaticMarkup(createElement(WhatsNewDialog, { release: single, markSeen: async () => undefined }));
    expect(html).toContain(">Done<");
    expect(html).not.toContain(">Next<");
  });
});
