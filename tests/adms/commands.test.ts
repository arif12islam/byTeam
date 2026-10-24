import { describe, expect, it } from "vitest";

import { formatCommand, MAX_ATTEMPTS, RESEND_AFTER_SECONDS } from "@/lib/adms/commands";

describe("formatCommand", () => {
  it("writes C:<id>:<command>", () => {
    expect(formatCommand(12, "DATA UPDATE USERINFO PIN=1001\tName=Rahim")).toBe(
      "C:12:DATA UPDATE USERINFO PIN=1001\tName=Rahim",
    );
  });

  it("turns line breaks into spaces so one command cannot carry a second", () => {
    const text = formatCommand(1, "DATA UPDATE USERINFO PIN=1\r\nC:99:REBOOT");
    expect(text).not.toMatch(/[\r\n]/);
    expect(text).toBe("C:1:DATA UPDATE USERINFO PIN=1 C:99:REBOOT");
  });

  it("trims padding", () => {
    expect(formatCommand(3, "  REBOOT \n")).toBe("C:3:REBOOT");
  });
});

describe("retry settings", () => {
  it("offer a command again after a few minutes and give up after a few tries", () => {
    expect(RESEND_AFTER_SECONDS).toBeGreaterThanOrEqual(60);
    expect(MAX_ATTEMPTS).toBeGreaterThanOrEqual(2);
  });
});
