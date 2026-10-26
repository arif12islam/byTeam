import { describe, expect, it } from "vitest";

import { AGENT_TASK_NAME, agentInstallerScript } from "@/lib/devices/agent-installer";

describe("agentInstallerScript", () => {
  const script = agentInstallerScript("https://byteam.bykorp.com");

  it("fills in this byTeam's address and downloads the agent from it", () => {
    expect(script).toContain("$Server = 'https://byteam.bykorp.com'");
    expect(script).toContain('($Server + "/downloads/byteam-agent.js")');
  });

  it("tests the device and byTeam before setting anything to start automatically", () => {
    expect(script.indexOf("--check")).toBeGreaterThan(0);
    expect(script.indexOf("--check")).toBeLessThan(script.indexOf("Register-ScheduledTask"));
    expect(script).toContain("if ($LASTEXITCODE -ne 0)");
    expect(script).toContain(`$TaskName = '${AGENT_TASK_NAME}'`);
  });

  it("uses Windows line endings and no PowerShell escape characters", () => {
    expect(script).toContain("\r\n");
    expect(script).not.toContain("`");
  });

  it("refuses anything that is not a plain server address", () => {
    expect(() => agentInstallerScript("https://byteam.bykorp.com/x'; Remove-Item C:\\")).toThrow();
    expect(() => agentInstallerScript("byteam.bykorp.com")).toThrow();
    expect(agentInstallerScript("http://localhost:3000")).toContain("$Server = 'http://localhost:3000'");
  });
});
