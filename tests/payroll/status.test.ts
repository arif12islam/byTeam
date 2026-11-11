import { describe, expect, it } from "vitest";

import { describeRunStatus } from "@/lib/payroll/status";

describe("describeRunStatus", () => {
  it("calls an open month a draft in the warning tone", () => {
    const s = describeRunStatus({ status: "draft", version: 1, finalizedAt: null, finalizedByName: null });
    expect(s.tone).toBe("warning");
    expect(s.badge).toBe("Draft");
  });

  it("names the version, who and when for a finalized month", () => {
    const s = describeRunStatus({ status: "finalized", version: 2, finalizedAt: new Date("2026-11-03T05:00:00Z"), finalizedByName: "Asha" });
    expect(s.tone).toBe("success");
    expect(s.badge).toBe("Finalized v2");
    expect(s.detail).toContain("by Asha");
    expect(s.detail).toContain("locked");
  });

  it("copes with a missing finalizer", () => {
    const s = describeRunStatus({ status: "finalized", version: 1, finalizedAt: new Date("2026-11-03T05:00:00Z"), finalizedByName: null });
    expect(s.detail).not.toContain(" by ");
  });
});
