import { describe, expect, it } from "vitest";

import { personDayHref, personMonthHref } from "@/lib/attendance/links";

describe("attendance links", () => {
  it("opens one person's month", () => {
    expect(personMonthHref("abc", "2026-11")).toBe("/attendance/abc?month=2026-11");
  });

  it("opens one person's day and remembers it came from their calendar", () => {
    expect(personDayHref("abc", "2026-11-09")).toBe("/attendance/abc/2026-11-09?from=person");
  });
});
