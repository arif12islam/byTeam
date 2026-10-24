import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorPanel, NotFoundPanel } from "@/components/error-panel";

describe("ErrorPanel", () => {
  it("says what happened in plain words, offers to try again, and points back to Today", () => {
    const html = renderToStaticMarkup(createElement(ErrorPanel, { digest: "3914836991", onRetry: () => undefined }));
    expect(html).toContain("This page could not load");
    expect(html).toContain("Nothing you entered was lost");
    expect(html).toContain(">Try again<");
    expect(html).toContain('href="/today"');
    expect(html).toContain('role="alert"');
  });

  it("gives the reference to quote, and only when there is one", () => {
    expect(renderToStaticMarkup(createElement(ErrorPanel, { digest: "3914836991" }))).toContain("3914836991");
    expect(renderToStaticMarkup(createElement(ErrorPanel))).not.toContain("reference");
  });

  it("has no Try again button when there is nothing to retry", () => {
    expect(renderToStaticMarkup(createElement(ErrorPanel))).not.toContain("Try again");
  });

  it("never shows anything but its own words", () => {
    // The page is handed only a reference number, never the error text, so table names and addresses cannot reach the screen.
    const html = renderToStaticMarkup(createElement(ErrorPanel, { digest: "abc" }));
    expect(html).not.toMatch(/postgres|ECONN|select |stack/i);
  });
});

describe("NotFoundPanel", () => {
  it("says the page is missing and leads back to Today", () => {
    const html = renderToStaticMarkup(createElement(NotFoundPanel));
    expect(html).toContain("We could not find that page");
    expect(html).toContain('href="/today"');
  });
});

describe("house style for the words people read", () => {
  const SRC = path.join(__dirname, "..", "..", "src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return files(full);
      return /\.(tsx?|css)$/.test(name) ? [full] : [];
    });
  const all = files(SRC);

  it("covers the whole app", () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it("has no em dashes anywhere in the app", () => {
    const offenders = all.filter((f) => readFileSync(f, "utf8").includes("—")).map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it("has no emojis anywhere in the app", () => {
    // Pictographs and dingbats, flags, and the variation selector that turns a symbol into an emoji.
    const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
    const offenders = all.filter((f) => emoji.test(readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
