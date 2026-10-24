import { describe, expect, it } from "vitest";

import { initials } from "@/components/ui/avatar";

describe("initials", () => {
  it("uses the first and last name", () => {
    expect(initials("Farhana Akter")).toBe("FA");
    expect(initials("Md Abdul Karim")).toBe("MK");
  });

  it("uses one letter for a single name", () => {
    expect(initials("Rubina")).toBe("R");
  });

  it("ignores extra spaces and lower case", () => {
    expect(initials("  tanvir   ahmed ")).toBe("TA");
  });

  it("falls back to a question mark for an empty name", () => {
    expect(initials("   ")).toBe("?");
  });
});
