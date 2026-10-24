import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

const html = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(Button, { type: "submit", ...props }, "Save salary"));

describe("Button", () => {
  it("keeps its label while saving, so it keeps its size", () => {
    const idle = html({});
    const saving = html({ pending: true });
    expect(idle).toContain("Save salary");
    expect(saving).toContain("Save salary");
    // The label stays in the page but is see-through, with a spinner laid over it.
    expect(saving).toContain("opacity-0");
    expect(saving).toContain("animate-spin");
    expect(idle).not.toContain("animate-spin");
    expect(idle).not.toContain("opacity-0");
  });

  it("turns itself off and says it is busy while saving", () => {
    const saving = html({ pending: true });
    expect(saving).toContain('disabled=""');
    expect(saving).toContain('aria-busy="true"');
    expect(html({})).not.toContain('disabled=""');
    expect(html({})).not.toContain("aria-busy");
  });

  it("stays off when asked to be, saving or not", () => {
    expect(html({ disabled: true })).toContain('disabled=""');
    expect(html({ disabled: true, pending: false })).toContain('disabled=""');
  });
});
