import { describe, expect, it } from "vitest";

import { suggestedCode } from "@/lib/punches/unmatched";

describe("suggestedCode", () => {
  it("passes a code made of digits through, keeping leading zeros", () => {
    expect(suggestedCode("1004")).toBe("1004");
    expect(suggestedCode("0042")).toBe("0042");
  });

  it("returns nothing for anything else", () => {
    for (const bad of [undefined, "", "abc", "12 3", "1".repeat(25), ["1", "2"], "<script>"]) {
      expect(suggestedCode(bad as string | string[] | undefined), String(bad)).toBe("");
    }
  });
});
