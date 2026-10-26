import { describe, expect, it } from "vitest";

import { createServer, NotRegisteredError, parsePollReply } from "../../agent/src/byteam";
import { officeTime, parseConfig } from "../../agent/src/config";

describe("parsePollReply", () => {
  it("is empty when byTeam has nothing for the device", () => {
    expect(parsePollReply("OK")).toEqual([]);
    expect(parsePollReply("")).toEqual([]);
  });

  it("reads a user command as byTeam writes it", () => {
    expect(parsePollReply("C:12:DATA UPDATE USERINFO PIN=1001\tName=Anwar Hossain\tPri=0\n")).toEqual([
      { id: 12, kind: "user", pin: "1001", name: "Anwar Hossain", privilege: 0 },
    ]);
  });

  it("marks anything else as not supported", () => {
    expect(parsePollReply("C:13:REBOOT")).toEqual([{ id: 13, kind: "unsupported", text: "REBOOT" }]);
    expect(parsePollReply("C:14:DATA UPDATE USERINFO Name=No pin")).toEqual([{ id: 14, kind: "unsupported", text: "DATA UPDATE USERINFO Name=No pin" }]);
  });
});

describe("createServer", () => {
  function recorder(status = 200, body = "OK") {
    const calls: { url: string; method: string; body: string | null; agent: string | null }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: (init?.body as string | undefined) ?? null,
        agent: new Headers(init?.headers).get("user-agent"),
      });
      return new Response(body, { status, headers: status === 308 ? { location: "https://x" } : {} });
    };
    return { calls, server: createServer("https://byteam.bykorp.com/", { fetchImpl }) };
  }

  it("speaks to the same addresses a push device uses", async () => {
    const { calls, server } = recorder();
    await server.handshake("5275220900056");
    await server.upload("5275220900056", ["1001\t2026-10-26 08:58:00\t0\t1\t0\t0\t0"]);
    await server.nextCommands("5275220900056");
    await server.report("5275220900056", 12, 0);
    await server.reportClock("5275220900056", -4);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://byteam.bykorp.com/iclock/cdata?SN=5275220900056&options=all&pushver=2.4.1&language=69",
      "POST https://byteam.bykorp.com/iclock/cdata?SN=5275220900056&table=ATTLOG&Stamp=9999",
      "GET https://byteam.bykorp.com/iclock/getrequest?SN=5275220900056",
      "POST https://byteam.bykorp.com/iclock/devicecmd?SN=5275220900056",
      "GET https://byteam.bykorp.com/iclock/cdata?SN=5275220900056&options=all&clockOffset=-4",
    ]);
    expect(calls[1].body).toBe("1001\t2026-10-26 08:58:00\t0\t1\t0\t0\t0\n");
    expect(calls[3].body).toBe("ID=12&Return=0&CMD=DATA\n");
    expect(calls[0].agent).toMatch(/^byTeam-agent\//);
  });

  it("explains a serial number byTeam does not accept", async () => {
    const { server } = recorder(403, "ERROR: device not registered\n");
    await expect(server.handshake("X1234")).rejects.toBeInstanceOf(NotRegisteredError);
    await expect(server.handshake("X1234")).rejects.toThrow(/Devices screen/);
  });

  it("explains a redirect, which means plain http was used", async () => {
    const { server } = recorder(308, "");
    await expect(server.nextCommands("X1234")).rejects.toThrow(/https/);
  });

  it("fails an upload byTeam did not take", async () => {
    const { server } = recorder(500, "ERROR");
    await expect(server.upload("X1234", ["a"])).rejects.toThrow(/500/);
  });
});

describe("parseConfig", () => {
  it("fills in the defaults", () => {
    expect(parseConfig('{"server":"https://byteam.bykorp.com","device":{"host":"192.168.1.201"}}')).toEqual({
      server: "https://byteam.bykorp.com",
      device: { host: "192.168.1.201", port: 4370, commKey: 0 },
      pollSeconds: 60,
      timeZone: "Asia/Dhaka",
    });
  });

  it("reads a file Windows PowerShell wrote, with its byte order mark", () => {
    expect(parseConfig('﻿{"server":"https://a.b","device":{"host":"10.0.0.5","port":4371,"commKey":99},"pollSeconds":5}')).toMatchObject({
      device: { port: 4371, commKey: 99 },
      pollSeconds: 15,
    });
  });

  it("says what is missing", () => {
    expect(() => parseConfig('{"device":{"host":"1.2.3.4"}}')).toThrow(/server/);
    expect(() => parseConfig('{"server":"https://a.b"}')).toThrow(/device.host/);
  });
});

describe("officeTime", () => {
  it("gives Dhaka wall clock time", () => {
    expect(officeTime("Asia/Dhaka", new Date("2026-10-26T03:15:30Z"))).toEqual({ year: 2026, month: 10, day: 26, hour: 9, minute: 15, second: 30 });
    expect(officeTime("Asia/Dhaka", new Date("2026-10-26T18:30:00Z"))).toMatchObject({ day: 27, hour: 0, minute: 30 });
  });
});
