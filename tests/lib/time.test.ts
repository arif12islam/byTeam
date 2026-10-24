import { describe, expect, it } from "vitest";

import { daysInMonth, previousDate, toOfficeDate } from "@/lib/time";

describe("toOfficeDate", () => {
  it("uses the Dhaka date, not the UTC date", () => {
    // 18:30 UTC on Oct 23 is 00:30 on Oct 24 in Dhaka (UTC+6)
    expect(toOfficeDate(new Date("2026-10-23T18:30:00Z"))).toBe("2026-10-24");
  });

  it("keeps the same date during office hours", () => {
    expect(toOfficeDate(new Date("2026-10-24T03:15:00Z"))).toBe("2026-10-24");
  });
});

describe("previousDate", () => {
  it("crosses month and year boundaries", () => {
    expect(previousDate("2026-11-01")).toBe("2026-10-31");
    expect(previousDate("2027-01-01")).toBe("2026-12-31");
  });

  it("handles leap years", () => {
    expect(previousDate("2028-03-01")).toBe("2028-02-29");
  });
});

describe("daysInMonth", () => {
  it("returns the length of each month", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-10")).toBe(31);
    expect(daysInMonth("2026-11")).toBe(30);
  });
});
