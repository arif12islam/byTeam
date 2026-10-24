import { describe, expect, it } from "vitest";

import {
  daysInMonth,
  formatMonth,
  formatOfficeDateTime,
  formatOfficeDate,
  isValidMonth,
  isValidOfficeDate,
  officeDateTimeToInstant,
  previousDate,
  toOfficeDate,
  toOfficeMonth,
  weekdayOf,
} from "@/lib/time";

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

describe("isValidOfficeDate", () => {
  it("accepts real dates including a leap day", () => {
    expect(isValidOfficeDate("2026-10-24")).toBe(true);
    expect(isValidOfficeDate("2028-02-29")).toBe(true);
  });

  it("rejects dates that do not exist", () => {
    expect(isValidOfficeDate("2026-02-29")).toBe(false);
    expect(isValidOfficeDate("2026-13-01")).toBe(false);
    expect(isValidOfficeDate("2026-04-31")).toBe(false);
  });

  it("rejects other formats", () => {
    expect(isValidOfficeDate("24/10/2026")).toBe(false);
    expect(isValidOfficeDate("2026-1-5")).toBe(false);
    expect(isValidOfficeDate("")).toBe(false);
  });
});

describe("weekdayOf", () => {
  it("returns 0 for Sunday to 6 for Saturday", () => {
    expect(weekdayOf("2026-10-25")).toBe(0);
    expect(weekdayOf("2026-10-24")).toBe(6);
    expect(weekdayOf("2026-10-23")).toBe(5);
  });
});

describe("formatOfficeDate", () => {
  it("writes weekday, day, month and year", () => {
    expect(formatOfficeDate("2026-02-21")).toBe("Sat 21 Feb 2026");
    expect(formatOfficeDate("2026-12-01")).toBe("Tue 1 Dec 2026");
  });
});

describe("isValidMonth", () => {
  it("accepts YYYY-MM with a real month", () => {
    expect(isValidMonth("2026-01")).toBe(true);
    expect(isValidMonth("2026-12")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isValidMonth("2026-00")).toBe(false);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("2026-1")).toBe(false);
    expect(isValidMonth("2026-01-01")).toBe(false);
    expect(isValidMonth("")).toBe(false);
  });
});

describe("toOfficeMonth", () => {
  it("uses the Dhaka month at a month boundary", () => {
    // 18:30 UTC on Oct 31 is 00:30 on Nov 1 in Dhaka
    expect(toOfficeMonth(new Date("2026-10-31T18:30:00Z"))).toBe("2026-11");
    expect(toOfficeMonth(new Date("2026-10-31T17:30:00Z"))).toBe("2026-10");
  });
});

describe("formatMonth", () => {
  it("writes the short month and year", () => {
    expect(formatMonth("2026-01")).toBe("Jan 2026");
    expect(formatMonth("2026-12")).toBe("Dec 2026");
  });
});

describe("formatOfficeDateTime", () => {
  it("shows the Dhaka date and 24 hour time", () => {
    expect(formatOfficeDateTime(new Date("2026-10-24T03:15:00Z"))).toBe("24 Oct 2026, 09:15");
  });

  it("rolls into the next Dhaka day after 18:00 UTC", () => {
    expect(formatOfficeDateTime(new Date("2026-10-23T18:30:00Z"))).toBe("24 Oct 2026, 00:30");
  });
});

describe("officeDateTimeToInstant", () => {
  it("reads a Dhaka clock time as UTC+6", () => {
    expect(officeDateTimeToInstant("2026-10-24", "09:00:00")?.toISOString()).toBe("2026-10-24T03:00:00.000Z");
    expect(officeDateTimeToInstant("2026-10-24", "09:00")?.toISOString()).toBe("2026-10-24T03:00:00.000Z");
  });

  it("puts an early morning punch on the previous UTC day", () => {
    expect(officeDateTimeToInstant("2026-10-24", "00:30:15")?.toISOString()).toBe("2026-10-23T18:30:15.000Z");
  });

  it("round trips with toOfficeDate", () => {
    const instant = officeDateTimeToInstant("2026-10-24", "23:59:59")!;
    expect(toOfficeDate(instant)).toBe("2026-10-24");
    expect(formatOfficeDateTime(instant)).toBe("24 Oct 2026, 23:59");
  });

  it("is null for impossible dates or times", () => {
    expect(officeDateTimeToInstant("2026-02-30", "09:00:00")).toBeNull();
    expect(officeDateTimeToInstant("2026-10-24", "24:00:00")).toBeNull();
    expect(officeDateTimeToInstant("2026-10-24", "09:60:00")).toBeNull();
    expect(officeDateTimeToInstant("2026-10-24", "9am")).toBeNull();
    expect(officeDateTimeToInstant("", "09:00:00")).toBeNull();
  });
});
