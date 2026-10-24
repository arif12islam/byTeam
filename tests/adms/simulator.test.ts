import { describe, expect, it } from "vitest";

import { adaptAttlogBody } from "@/lib/adms/zkteco-adapter";

import {
  attlogBody,
  attlogLine,
  deviceTime,
  punchKey,
  readCommandReply,
  uniquePunches,
  workDay,
} from "../../scripts/simulator-lib";

const SN = "SIM0000001";

describe("deviceTime", () => {
  it("writes the Dhaka clock the way a device does", () => {
    expect(deviceTime(new Date("2026-10-24T03:00:00Z"))).toBe("2026-10-24 09:00:00");
    expect(deviceTime(new Date("2026-10-23T18:30:15Z"))).toBe("2026-10-24 00:30:15");
  });
});

describe("what the simulator sends is what the real parser reads", () => {
  it("round trips a line", () => {
    const at = new Date("2026-10-24T03:00:00Z");
    const line = attlogLine({ code: "1001", at, status: 1, verify: 15 });
    expect(line).toBe("1001\t2026-10-24 09:00:00\t1\t15\t0\t0\t0");
    const { punches, skipped } = adaptAttlogBody(SN, line);
    expect(skipped).toBe(0);
    expect(punches[0]).toMatchObject({ empCode: "1001", punchedAt: at, statusCode: 1, verifyCode: 15 });
  });

  it("round trips a whole working day for several codes with nothing skipped", () => {
    const day = workDay(["1001", "1002", "1003"], "2026-10-23");
    const { punches, skipped } = adaptAttlogBody(SN, attlogBody(day));
    expect(skipped).toBe(0);
    expect(punches).toHaveLength(6);
    expect(punches.map((p) => p.punchedAt.getTime())).toEqual(day.map((p) => p.at.getTime()));
  });
});

describe("workDay", () => {
  it("gives each code a check in near 09:00 and a check out near 18:00 on that Dhaka date", () => {
    const day = workDay(["1001", "1002"], "2026-10-23");
    for (const code of ["1001", "1002"]) {
      const mine = day.filter((p) => p.code === code);
      expect(mine).toHaveLength(2);
      const [first, second] = mine;
      expect(deviceTime(first.at).slice(0, 13)).toMatch(/^2026-10-23 09/);
      expect(deviceTime(second.at).slice(0, 13)).toMatch(/^2026-10-23 18/);
      expect(first.status).toBe(0);
      expect(second.status).toBe(1);
    }
  });

  it("never makes two punches with the same key, even for many codes", () => {
    const codes = Array.from({ length: 40 }, (_, i) => String(1000 + i));
    const day = workDay(codes, "2026-10-23");
    expect(new Set(day.map(punchKey)).size).toBe(day.length);
  });

  it("is sorted by time", () => {
    const times = workDay(["1001", "1002", "1003"], "2026-10-23").map((p) => p.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe("uniquePunches", () => {
  it("counts a resent punch once", () => {
    const day = workDay(["1001", "1002"], "2026-10-23");
    expect(uniquePunches([...day, ...day, ...day.slice(0, 1)])).toHaveLength(day.length);
  });
});

describe("readCommandReply", () => {
  it("reads a command", () => {
    expect(readCommandReply("C:12:DATA UPDATE USERINFO PIN=1001\tName=Rahim\tPri=0")).toEqual({
      id: 12,
      command: "DATA UPDATE USERINFO PIN=1001\tName=Rahim\tPri=0",
    });
  });

  it("is null for OK and for anything else", () => {
    for (const reply of ["OK", "", "ERROR: x", "C:abc:REBOOT"]) expect(readCommandReply(reply)).toBeNull();
  });
});
