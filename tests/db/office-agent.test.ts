import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { deviceCommands, devices, rawPunches } from "@/db/schema";

import { EMPTY_STATE, runCycle } from "../../agent/src/agent";
import { createServer } from "../../agent/src/byteam";
import { ZkClient } from "../../agent/src/zk-client";
import { startFakeDevice, type FakeDevice } from "../agent/fake-device";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

/**
 * The whole chain with nothing pretend but the device: the real agent and its
 * device client talk to a fake K40H over TCP, and to byTeam's real /iclock
 * route handlers on the test database. Punches must land in raw_punches, and a
 * person queued in byTeam must end up on the device.
 */
describe.skipIf(!testDatabaseUrl)("office agent end to end", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let fake: FakeDevice | null = null;

  beforeAll(() => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ db, close } = connect());
  });
  afterAll(async () => {
    await fake?.close();
    await close();
  });

  /** fetch that hands each request to the matching route handler instead of the network. */
  const routeFetch: typeof fetch = async (input, init) => {
    const request = new Request(input as string, init);
    const path = new URL(request.url).pathname;
    if (path === "/iclock/cdata") {
      const route = await import("@/app/iclock/cdata/route");
      return request.method === "GET" ? route.GET(request) : route.POST(request);
    }
    if (path === "/iclock/getrequest") return (await import("@/app/iclock/getrequest/route")).GET(request);
    if (path === "/iclock/devicecmd") return (await import("@/app/iclock/devicecmd/route")).POST(request);
    return new Response("not found", { status: 404 });
  };

  it("brings punches into byTeam and employees onto the device", async () => {
    const serial = uniqueSerial("AGT");
    await addTestDevice(db, serial);
    const code = uniqueCode();
    const at = (hour: number, minute: number) => ({ year: 2026, month: 10, day: 25, hour, minute, second: 0 });
    fake = await startFakeDevice({
      serial,
      chunked: true,
      users: [{ uid: 1, userId: "1", name: "Office admin", privilege: 14, password: "", card: 0, groupId: "1" }],
      punches: [
        { userId: code, time: at(8, 52), verify: 1, state: 0 },
        { userId: code, time: at(18, 4), verify: 1, state: 1 },
      ],
    });

    const device = new ZkClient({ host: "127.0.0.1", port: fake.port, commKey: 0, timeoutMs: 3000 });
    const server = createServer("http://byteam.test", { fetchImpl: routeFetch });
    const officeNow = () => ({ year: 2026, month: 10, day: 26, hour: 9, minute: 0, second: 0 });
    const run = (state = EMPTY_STATE) => runCycle({ device, server, state, now: Date.now(), officeNow, log: () => {} });

    // First run: both punches stored, exactly once.
    let state = await run();
    const stored = await db.select().from(rawPunches).where(and(eq(rawPunches.deviceSn, serial), eq(rawPunches.empCode, code)));
    expect(stored).toHaveLength(2);
    expect(stored.map((p) => p.rawLine).sort()).toEqual([
      `${code}\t2026-10-25 08:52:00\t0\t1\t0\t0\t0`,
      `${code}\t2026-10-25 18:04:00\t1\t1\t0\t0\t0`,
    ]);
    const [row] = await db.select().from(devices).where(eq(devices.serialNo, serial));
    expect(row.lastSeenAt).not.toBeNull();
    // The clock is what the agent measured and set, not guessed from the age of yesterday's punches.
    expect(row.clockOffsetSeconds).toBe(0);

    // A person added in byTeam is queued for the device and written by the next run.
    const { queueUserUpdate } = await import("@/lib/devices/queue");
    await queueUserUpdate(db, { empCode: code, name: "Anwar Hossain" });
    state = await run(state);
    // Other test files add employees at the same time, and those are queued for every active device too, so only
    // this person's own slot and command are checked. The admin keeps slot 1 and admin rights.
    const person = fake.state.users.find((u) => u.userId === code);
    expect(person).toMatchObject({ name: "Anwar Hossain", privilege: 0 });
    expect(person?.uid).toBeGreaterThan(1);
    expect(fake.state.users.find((u) => u.uid === 1)).toMatchObject({ userId: "1", privilege: 14 });
    const commands = await db.select().from(deviceCommands).where(eq(deviceCommands.deviceSn, serial));
    expect(commands.filter((c) => c.command.includes(`PIN=${code}\t`)).map((c) => c.status)).toEqual(["done"]);

    // A new punch later on arrives, and the earlier ones are not duplicated.
    fake.state.punches.push({ userId: code, time: { ...at(9, 1), day: 26 }, verify: 1, state: 0 });
    await run(state);
    expect(await db.select().from(rawPunches).where(eq(rawPunches.deviceSn, serial))).toHaveLength(3);
  });
});
