import { describe, expect, it } from "vitest";

import { freeSampleCodes, markAsSample, SAMPLE_PREFIX } from "@/lib/demo/sample";
import { buildDemoPlan } from "@/lib/demo/scenarios";

describe("freeSampleCodes", () => {
  it("starts at 9001 to 9008", () => {
    expect(freeSampleCodes(new Set())).toEqual(["9001", "9002", "9003", "9004", "9005", "9006", "9007", "9008"]);
  });

  it("moves to the next hundred when any code in a block is taken", () => {
    expect(freeSampleCodes(new Set(["9005"]))?.[0]).toBe("9101");
    expect(freeSampleCodes(new Set(["9001", "9108"]))?.[0]).toBe("9201");
  });

  it("gives up when every block is taken", () => {
    const all = new Set(Array.from({ length: 10 }, (_, i) => String(9001 + i * 100)));
    expect(freeSampleCodes(all)).toBeNull();
  });
});

describe("markAsSample", () => {
  it("names every person Sample and marks their department", () => {
    const plan = markAsSample(buildDemoPlan("2026-09", [5, 6], ["9001", "9002", "9003", "9004", "9005", "9006", "9007", "9008"]));
    expect(plan.employees.every((e) => e.name.startsWith(SAMPLE_PREFIX) && e.department.endsWith("(sample)"))).toBe(true);
    expect(plan.employees[0].name).toBe("Sample Anwar Hossain");
  });
});
