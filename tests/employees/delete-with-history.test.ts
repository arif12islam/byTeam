import { describe, expect, it } from "vitest";

import { finalizedPayrollMessage, nameConfirmed } from "@/lib/employees/employees";

describe("nameConfirmed", () => {
  it("accepts the name as written, ignoring extra spaces", () => {
    expect(nameConfirmed("Sharif Bhuiyan", "Sharif Bhuiyan")).toBe(true);
    expect(nameConfirmed("  Sharif   Bhuiyan ", "Sharif Bhuiyan")).toBe(true);
  });

  it("refuses another case, another name and nothing", () => {
    expect(nameConfirmed("sharif bhuiyan", "Sharif Bhuiyan")).toBe(false);
    expect(nameConfirmed("Sharif", "Sharif Bhuiyan")).toBe(false);
    expect(nameConfirmed("", "")).toBe(false);
    expect(nameConfirmed("   ", "Sharif Bhuiyan")).toBe(false);
  });
});

describe("finalizedPayrollMessage", () => {
  it("names one month", () => {
    expect(finalizedPayrollMessage("Asha", new Set(["2026-03"]))).toBe("Payroll for Mar 2026 is finalized and includes Asha, so they cannot be deleted. Unlock that month first.");
  });

  it("names several months in order", () => {
    expect(finalizedPayrollMessage("Asha", new Set(["2026-04", "2026-03"]))).toBe(
      "Payroll for Mar 2026 and Apr 2026 is finalized and includes Asha, so they cannot be deleted. Unlock those months first.",
    );
  });
});
