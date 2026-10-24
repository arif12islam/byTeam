import { describe, expect, it } from "vitest";

import { isLockedDate, lockedMessage } from "@/lib/payroll/lock";

describe("isLockedDate", () => {
  const locked = new Set(["2026-05", "2026-07"]);

  it("is true for any day of a locked month, and only those", () => {
    expect(isLockedDate("2026-05-01", locked)).toBe(true);
    expect(isLockedDate("2026-05-31", locked)).toBe(true);
    expect(isLockedDate("2026-07-15", locked)).toBe(true);
    expect(isLockedDate("2026-06-15", locked)).toBe(false);
    expect(isLockedDate("2025-05-15", locked)).toBe(false);
    expect(isLockedDate("2026-05-15", new Set())).toBe(false);
  });
});

describe("lockedMessage", () => {
  it("names one month", () => {
    expect(lockedMessage(new Set(["2026-05"]), "leave in those dates")).toBe(
      "Payroll for May 2026 is finalized, so leave in those dates cannot be changed. Ask the owner to unlock the month first.",
    );
  });

  it("names several months in order", () => {
    expect(lockedMessage(new Set(["2026-07", "2026-05"]), "this leave request")).toBe(
      "Payroll for May 2026 and Jul 2026 is finalized, so this leave request cannot be changed. Ask the owner to unlock those months first.",
    );
    expect(lockedMessage(new Set(["2026-07", "2026-05", "2026-06"]), "x")).toContain("May 2026, Jun 2026 and Jul 2026");
  });
});
