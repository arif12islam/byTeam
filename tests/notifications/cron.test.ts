import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { handleNotifyRequest } from "@/lib/notifications/cron";
import { officeDateTimeToInstant } from "@/lib/time";

vi.mock("server-only", () => ({}));

const at = (time: string) => officeDateTimeToInstant("2026-11-10", time)!;
const call = (headers: Record<string, string>, deps: Parameters<typeof handleNotifyRequest>[1]) =>
  handleNotifyRequest(new Request("https://byteam.test/api/cron/notify", { headers }), deps);

describe("the scheduler request", () => {
  const summary = { offline: 0, recovered: 0, summary: false, unmatched: 0, delivered: 0 };

  it("needs the secret as a bearer token, and a secret to be set at all", async () => {
    const run = vi.fn(async () => summary);
    expect((await call({}, { secret: "s3cret", now: () => at("12:00"), run })).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong" }, { secret: "s3cret", now: () => at("12:00"), run })).status).toBe(401);
    expect((await call({ authorization: "Bearer undefined" }, { secret: undefined, now: () => at("12:00"), run })).status).toBe(401);
    expect((await call({ authorization: "Bearer " }, { secret: "", now: () => at("12:00"), run })).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("does the checks in office hours and says what they did", async () => {
    const run = vi.fn(async () => ({ ...summary, offline: 1, delivered: 2 }));
    const response = await call({ authorization: "Bearer s3cret" }, { secret: "s3cret", now: () => at("12:00"), run });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, offline: 1, delivered: 2 });
    expect(run).toHaveBeenCalledOnce();
  });

  it("answers at once, without the checks, outside 07:00 to 21:00", async () => {
    const run = vi.fn(async () => summary);
    for (const time of ["02:00", "06:59", "21:01", "23:30"]) {
      const response = await call({ authorization: "Bearer s3cret" }, { secret: "s3cret", now: () => at(time), run });
      expect(await response.json(), time).toMatchObject({ ok: true, skipped: expect.any(String) });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("answers 500 without details when a check fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const run = vi.fn(async () => {
      throw new Error("database password is hunter2");
    });
    const response = await call({ authorization: "Bearer s3cret" }, { secret: "s3cret", now: () => at("12:00"), run });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("hunter2");
    error.mockRestore();
  });
});

describe("the service worker and its route", () => {
  const read = (...parts: string[]) => readFileSync(path.join(__dirname, "..", "..", ...parts), "utf8");

  it("shows pushes and opens the page on a tap, and handles no normal requests", () => {
    const sw = read("public", "sw.js");
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).not.toContain('addEventListener("fetch"');
    // Only addresses inside the app are opened.
    expect(sw).toContain('startsWith("/")');
  });

  it("is reachable without signing in, as the phone asks for it before anyone does", () => {
    const proxy = read("src", "proxy.ts");
    expect(proxy).toContain("sw.js");
    expect(proxy).toContain("api/cron");
  });
});
