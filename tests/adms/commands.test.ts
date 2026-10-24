import { describe, expect, it } from "vitest";

import { formatCommand, MAX_ATTEMPTS, parseCommandResults, RESEND_AFTER_SECONDS } from "@/lib/adms/commands";

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

describe("parseCommandResults", () => {
  it("reads one result per line", () => {
    expect(parseCommandResults("ID=12&Return=0&CMD=DATA\r\nID=13&Return=-1002&CMD=DATA\r\n")).toEqual([
      { id: 12, returnCode: 0, cmd: "DATA" },
      { id: 13, returnCode: -1002, cmd: "DATA" },
    ]);
  });

  it("reads a result without the command name", () => {
    expect(parseCommandResults("ID=5&Return=1")).toEqual([{ id: 5, returnCode: 1, cmd: null }]);
  });

  it("skips blank, malformed and unusable lines but keeps the good ones", () => {
    const body = ["", "garbage", "ID=abc&Return=0", "ID=0&Return=0", "ID=7", "Return=0", "ID=8&Return=x", "ID=9&Return=0&CMD=REBOOT"].join("\n");
    expect(parseCommandResults(body)).toEqual([{ id: 9, returnCode: 0, cmd: "REBOOT" }]);
  });

  it("is empty for an empty body", () => {
    expect(parseCommandResults("")).toEqual([]);
  });
});
