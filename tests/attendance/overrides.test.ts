import { describe, expect, it } from "vitest";

import { effectiveOverrides, type AdjustmentRow } from "@/lib/attendance/overrides";

const t = (minutes: number) => new Date(Date.UTC(2026, 9, 26, 6, minutes));
const row = (field: AdjustmentRow["field"], newValue: string | null, minutes: number): AdjustmentRow => ({
  field,
  newValue,
  createdAt: t(minutes),
});

describe("effectiveOverrides", () => {
  it("is empty when there are no adjustments", () => {
    expect(effectiveOverrides([])).toEqual({});
  });

  it("reads a status and two times", () => {
    const result = effectiveOverrides([
      row("status", "present", 1),
      row("first_in", "2026-10-26T03:00:00Z", 2),
      row("last_out", "2026-10-26T12:00:00Z", 3),
    ]);
    expect(result.status).toBe("present");
    expect(result.firstIn?.toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(result.lastOut?.toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });

  it("lets the newest adjustment for a field win, whatever order the rows come in", () => {
    const rows = [row("status", "absent", 1), row("status", "present", 3), row("status", "late", 2)];
    expect(effectiveOverrides(rows).status).toBe("present");
    expect(effectiveOverrides([...rows].reverse()).status).toBe("present");
  });

  it("clears an override when the newest adjustment has no value", () => {
    expect(effectiveOverrides([row("status", "present", 1), row("status", null, 2)])).toEqual({});
    expect(effectiveOverrides([row("last_out", "2026-10-26T12:00:00Z", 1), row("last_out", null, 2)])).toEqual({});
  });

  it("sets a field again after it was cleared", () => {
    const result = effectiveOverrides([row("status", "present", 1), row("status", null, 2), row("status", "late", 3)]);
    expect(result.status).toBe("late");
  });

  it("keeps each field separate", () => {
    const result = effectiveOverrides([row("status", "present", 5), row("first_in", "2026-10-26T03:00:00Z", 1), row("first_in", null, 2)]);
    expect(result).toEqual({ status: "present" });
  });

  it("lets the later row win when two have the same time", () => {
    expect(effectiveOverrides([row("status", "absent", 1), row("status", "present", 1)]).status).toBe("present");
  });

  it("ignores values it cannot read", () => {
    expect(effectiveOverrides([row("status", "on_the_moon", 1), row("first_in", "not a date", 2)])).toEqual({});
  });
});
