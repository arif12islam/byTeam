import { describe, expect, it } from "vitest";

import { parseAttlogLine, splitLines } from "@/lib/adms/parse";
import { adaptAttlogBody, toStandardPunch } from "@/lib/adms/zkteco-adapter";

const SN = "CJDE194960123";

describe("splitLines", () => {
  it("handles Unix and Windows line endings and drops blank lines", () => {
    expect(splitLines("a\r\nb\n\n  \r\nc\r\n")).toEqual(["a", "b", "c"]);
  });

  it("drops a byte order mark and an old style bare return", () => {
    expect(splitLines("﻿a\rb")).toEqual(["a", "b"]);
  });

  it("is empty for an empty or blank body", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines("\n\n   \n")).toEqual([]);
  });
});

describe("parseAttlogLine", () => {
  it("reads a tab separated line", () => {
    expect(parseAttlogLine("1001\t2026-10-24 09:00:00\t0\t15\t0\t0\t0")).toEqual({
      pin: "1001",
      date: "2026-10-24",
      time: "09:00:00",
      status: "0",
      verify: "15",
    });
  });

  it("ignores extra fields after the ones we use", () => {
    const fields = parseAttlogLine("1001\t2026-10-24 09:00:00\t1\t1\t0\t0\t0\textra\tmore");
    expect(fields).toMatchObject({ pin: "1001", status: "1", verify: "1" });
  });

  it("copes with missing status and verify fields", () => {
    expect(parseAttlogLine("1001\t2026-10-24 09:00:00")).toEqual({
      pin: "1001",
      date: "2026-10-24",
      time: "09:00:00",
      status: null,
      verify: null,
    });
  });

  it("reads a space separated line from a firmware that does not use tabs", () => {
    expect(parseAttlogLine("1001 2026-10-24 09:00:00 0 15")).toMatchObject({
      pin: "1001",
      date: "2026-10-24",
      time: "09:00:00",
      status: "0",
      verify: "15",
    });
  });

  it("trims padding around fields", () => {
    expect(parseAttlogLine("  1001 \t 2026-10-24 09:00:00 \t 0 \t 1  ")).toMatchObject({ pin: "1001", status: "0", verify: "1" });
  });

  it("keeps leading zeros in the PIN", () => {
    expect(parseAttlogLine("0042\t2026-10-24 09:00:00\t0\t1")?.pin).toBe("0042");
  });

  it("is null when the line cannot be a punch", () => {
    for (const bad of ["", "1001", "1001\t", "1001\t2026-10-24", "\t2026-10-24 09:00:00", "a b\t2026-10-24 09:00:00", "garbage"]) {
      expect(parseAttlogLine(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("toStandardPunch", () => {
  it("reads the device time as Dhaka time", () => {
    const punch = toStandardPunch(SN, "1001\t2026-10-24 09:00:00\t0\t15\t0\t0\t0");
    expect(punch).toEqual({
      deviceSn: SN,
      empCode: "1001",
      punchedAt: new Date("2026-10-24T03:00:00Z"),
      statusCode: 0,
      verifyCode: 15,
      rawLine: "1001\t2026-10-24 09:00:00\t0\t15\t0\t0\t0",
    });
  });

  it("keeps a punch just after midnight on the right instant", () => {
    expect(toStandardPunch(SN, "1001\t2026-10-24 00:05:00\t0\t1")?.punchedAt.toISOString()).toBe("2026-10-23T18:05:00.000Z");
  });

  it("stores null for status or verify that is not a small whole number", () => {
    expect(toStandardPunch(SN, "1001\t2026-10-24 09:00:00\tx\t99999")).toMatchObject({ statusCode: null, verifyCode: null });
    expect(toStandardPunch(SN, "1001\t2026-10-24 09:00:00")).toMatchObject({ statusCode: null, verifyCode: null });
  });

  it("is null for an impossible date or time", () => {
    expect(toStandardPunch(SN, "1001\t2026-02-30 09:00:00\t0\t1")).toBeNull();
    expect(toStandardPunch(SN, "1001\t2026-10-24 25:00:00\t0\t1")).toBeNull();
  });
});

describe("adaptAttlogBody", () => {
  it("turns a batch with blank lines, Windows endings and a bad line into punches and a skip count", () => {
    const body = [
      "1001\t2026-10-24 09:00:00\t0\t15",
      "",
      "1002\t2026-10-24 09:05:10\t0\t1\t0\t0\t0",
      "this is not a punch",
      "1001\t2026-10-24 18:02:00\t1\t15",
      "",
    ].join("\r\n");
    const { punches, skipped } = adaptAttlogBody(SN, body);
    expect(skipped).toBe(1);
    expect(punches.map((p) => `${p.empCode}@${p.punchedAt.toISOString()}`)).toEqual([
      "1001@2026-10-24T03:00:00.000Z",
      "1002@2026-10-24T03:05:10.000Z",
      "1001@2026-10-24T12:02:00.000Z",
    ]);
  });

  it("returns nothing for an empty upload", () => {
    expect(adaptAttlogBody(SN, "")).toEqual({ punches: [], skipped: 0 });
  });
});
