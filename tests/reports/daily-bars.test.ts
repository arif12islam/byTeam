import { describe, expect, it } from "vitest";

import { axisLabel } from "@/components/charts/daily-bars";

const point = (date: string) => ({ date, day: Number(date.slice(8)) });

describe("axisLabel", () => {
  it("labels every fifth day of a single month, and the last day", () => {
    const labels = Array.from({ length: 30 }, (_, i) => axisLabel(point(`2031-04-${String(i + 1).padStart(2, "0")}`), 30));
    expect(labels.filter(Boolean)).toEqual(["1", "6", "11", "16", "21", "26", "30"]);
  });

  it("labels only the first of each month over a longer period", () => {
    expect(axisLabel(point("2031-04-01"), 91)).toBe("Apr");
    expect(axisLabel(point("2031-05-01"), 91)).toBe("May");
    expect(axisLabel(point("2031-04-16"), 91)).toBe("");
    expect(axisLabel(point("2031-12-01"), 91)).toBe("Dec");
  });
});
