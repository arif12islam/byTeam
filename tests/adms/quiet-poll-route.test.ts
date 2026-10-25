import { beforeEach, describe, expect, it, vi } from "vitest";

// The poll route with the database replaced: each test counts how often the database would have been asked.
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => ({}) }));

const touchDevice = vi.fn();
vi.mock("@/lib/devices/receive", () => ({ touchDevice: (...args: unknown[]) => touchDevice(...args) }));

const claimNextCommand = vi.fn();
vi.mock("@/lib/devices/queue", () => ({ claimNextCommand: (...args: unknown[]) => claimNextCommand(...args) }));

const { GET } = await import("@/app/iclock/getrequest/route");
const { pollMemo } = await import("@/lib/adms/quiet-poll");

const poll = (serial: string) => GET(new Request(`http://localhost/iclock/getrequest?SN=${serial}`, { headers: { "x-forwarded-for": "10.0.0.9" } }));

beforeEach(() => {
  pollMemo.forget();
  touchDevice.mockReset();
  claimNextCommand.mockReset();
});

describe("quiet command polls", () => {
  it("asks the database on the first poll and answers the next ones from memory", async () => {
    touchDevice.mockResolvedValue({ id: "dev-1", serialNo: "QUIET0001" });
    claimNextCommand.mockResolvedValue(null);

    for (let i = 0; i < 5; i += 1) {
      const response = await poll("QUIET0001");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("OK");
    }
    expect(touchDevice).toHaveBeenCalledTimes(1);
    expect(claimNextCommand).toHaveBeenCalledTimes(1);
  });

  it("keeps asking while commands are waiting, then goes quiet", async () => {
    touchDevice.mockResolvedValue({ id: "dev-1", serialNo: "QUIET0002" });
    claimNextCommand
      .mockResolvedValueOnce({ id: 7, command: "DATA UPDATE USERINFO PIN=1001\tName=A" })
      .mockResolvedValueOnce({ id: 8, command: "DATA UPDATE USERINFO PIN=1002\tName=B" })
      .mockResolvedValue(null);

    expect(await (await poll("QUIET0002")).text()).toMatch(/^C:7:/);
    expect(await (await poll("QUIET0002")).text()).toMatch(/^C:8:/);
    expect(await (await poll("QUIET0002")).text()).toBe("OK");
    expect(await (await poll("QUIET0002")).text()).toBe("OK");
    expect(claimNextCommand).toHaveBeenCalledTimes(3);
  });

  it("refuses an unknown device from memory without asking the database again", async () => {
    touchDevice.mockResolvedValue(null);

    expect((await poll("QUIET0003")).status).toBe(403);
    expect((await poll("QUIET0003")).status).toBe(403);
    expect(touchDevice).toHaveBeenCalledTimes(1);
    expect(claimNextCommand).not.toHaveBeenCalled();
  });

  it("asks the database again once a change clears the memory", async () => {
    touchDevice.mockResolvedValue({ id: "dev-1", serialNo: "QUIET0004" });
    claimNextCommand.mockResolvedValue(null);

    await poll("QUIET0004");
    pollMemo.forget("QUIET0004");
    await poll("QUIET0004");
    expect(touchDevice).toHaveBeenCalledTimes(2);
  });
});
