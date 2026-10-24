import { describe, expect, it } from "vitest";

import {
  buildUserUpdateCommand,
  deviceUserName,
  formatCommand,
  MAX_ATTEMPTS,
  parseCommandResults,
  RESEND_AFTER_SECONDS,
} from "@/lib/adms/commands";

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

describe("deviceUserName", () => {
  it("keeps an ordinary name", () => {
    expect(deviceUserName("Rahim Uddin", "1001")).toBe("Rahim Uddin");
  });

  it("removes tabs and equals signs, which would break the command", () => {
    expect(deviceUserName("Ra\thim=Admin", "1001")).toBe("Ra him Admin");
  });

  it("drops line breaks and control characters and tidies spaces", () => {
    expect(deviceUserName("  Rahim\r\n\u0007  Uddin ", "1001")).toBe("Rahim Uddin");
  });

  it("cuts a long name to what the device holds without splitting a character", () => {
    const long = "A".repeat(30);
    expect(deviceUserName(long, "1001")).toBe("A".repeat(24));
    const bengali = "মোহাম্মদ আব্দুর রহমান খান চৌধুরী";
    const cut = deviceUserName(bengali, "1001");
    expect(Array.from(cut).length).toBeLessThanOrEqual(24);
    expect(bengali.startsWith(cut)).toBe(true);
  });

  it("falls back to the code when nothing usable is left", () => {
    expect(deviceUserName("\t=\n", "1001")).toBe("1001");
    expect(deviceUserName("", "1001")).toBe("1001");
  });
});

describe("buildUserUpdateCommand", () => {
  it("puts the employee code in as the PIN, with the name and a normal privilege", () => {
    expect(buildUserUpdateCommand({ empCode: "1001", name: "Rahim Uddin" })).toBe(
      "DATA UPDATE USERINFO PIN=1001\tName=Rahim Uddin\tPri=0",
    );
  });

  it("keeps leading zeros in the code", () => {
    expect(buildUserUpdateCommand({ empCode: "0042", name: "A" })).toContain("PIN=0042\t");
  });

  it("survives a hostile name: still one line, no extra fields", () => {
    const text = buildUserUpdateCommand({ empCode: "1001", name: "X\tPri=14\r\nC:5:REBOOT" });
    expect(text).not.toMatch(/[\r\n]/);
    expect(text.split("\t")).toHaveLength(3);
    expect(text.endsWith("\tPri=0")).toBe(true);
  });
});
