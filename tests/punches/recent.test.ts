import { describe, expect, it } from "vitest";

import { latestPerDevice } from "@/lib/punches/recent";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 25, 3, minute));
const row = (deviceSn: string, n: number) => ({ deviceSn, rawLine: `${n}\t2026-10-25 09:${String(n).padStart(2, "0")}:00\t0\t1`, receivedAt: at(n) });

describe("latestPerDevice", () => {
  it("keeps the newest lines of each device, in the order given", () => {
    const rows = [row("A", 9), row("B", 8), row("A", 7), row("A", 6), row("B", 5), row("A", 4)];
    const result = latestPerDevice(rows, 2);
    expect(result.get("A")?.map((r) => r.receivedAt)).toEqual([at(9), at(7)]);
    expect(result.get("B")?.map((r) => r.receivedAt)).toEqual([at(8), at(5)]);
  });

  it("is empty for no rows", () => {
    expect(latestPerDevice([], 5).size).toBe(0);
  });
});
