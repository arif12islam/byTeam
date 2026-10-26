import { describe, expect, it } from "vitest";

import {
  CLOCK_CHECK_EVERY_MS,
  EMPTY_STATE,
  punchesToSend,
  RETURN_FAILED,
  runCycle,
  userForCommand,
  type AgentState,
  type Device,
} from "../../agent/src/agent";
import { NotRegisteredError, parsePollReply, type Server, type ServerCommand } from "../../agent/src/byteam";
import type { ZkPunch, ZkTime, ZkUser } from "../../agent/src/zk-protocol";

const at = (day: number, hour: number, minute: number, second = 0): ZkTime => ({ year: 2026, month: 10, day, hour, minute, second });
const punch = (userId: string, time: ZkTime): ZkPunch => ({ userId, time, verify: 1, state: 0 });
const admin: ZkUser = { uid: 1, userId: "1", name: "Office admin", privilege: 14, password: "123", card: 99, groupId: "1" };

function fakeDevice(init: { punches?: ZkPunch[]; users?: ZkUser[]; time?: ZkTime; down?: boolean } = {}) {
  const d = {
    punches: [...(init.punches ?? [])],
    users: [...(init.users ?? [admin])],
    time: init.time ?? at(26, 9, 0),
    down: init.down ?? false,
    fullReads: 0,
    connected: false,
  };
  const device: Device = {
    async connect() {
      if (d.down) throw new Error("Cannot reach the device");
      d.connected = true;
    },
    async disconnect() {
      d.connected = false;
    },
    async serialNumber() {
      return "5275220900056";
    },
    async sizes() {
      return { users: d.users.length, fingers: 0, records: d.punches.length };
    },
    async users() {
      return [...d.users];
    },
    async punches() {
      d.fullReads += 1;
      return [...d.punches];
    },
    async writeUser(user) {
      d.users = [...d.users.filter((u) => u.uid !== user.uid), user];
    },
    async time() {
      return d.time;
    },
    async setTime(time) {
      d.time = time;
    },
  };
  return { d, device };
}

function fakeServer(queue: ServerCommand[] = [], registered = true) {
  const s = { handshakes: 0, uploads: [] as string[][], reports: [] as [number, number][], polls: 0, clock: [] as number[] };
  const server: Server = {
    async handshake(serial) {
      s.handshakes += 1;
      if (!registered) throw new NotRegisteredError(serial);
    },
    async upload(_serial, lines) {
      s.uploads.push([...lines]);
    },
    async nextCommands() {
      s.polls += 1;
      return queue.splice(0, 1);
    },
    async report(_serial, id, code) {
      s.reports.push([id, code]);
    },
    async reportClock(_serial, offset) {
      s.clock.push(offset);
    },
  };
  return { s, server };
}

const office = () => at(26, 9, 0);
const logs: string[] = [];
const log = (m: string) => logs.push(m);

async function cycle(device: Device, server: Server, state: AgentState, now = Date.UTC(2026, 9, 26, 3, 0)) {
  return runCycle({ device, server, state, now, officeNow: office, log });
}

describe("runCycle", () => {
  it("sends every punch on the first run, oldest first, as push lines", async () => {
    const { device } = fakeDevice({ punches: [punch("1002", at(25, 18, 1)), punch("1001", at(25, 8, 52))] });
    const { s, server } = fakeServer();
    const state = await cycle(device, server, EMPTY_STATE);
    expect(s.handshakes).toBe(1);
    expect(s.uploads).toEqual([["1001\t2026-10-25 08:52:00\t0\t1\t0\t0\t0", "1002\t2026-10-25 18:01:00\t0\t1\t0\t0\t0"]]);
    expect(state).toMatchObject({ sentUpTo: "2026-10-25 18:01:00", recordCount: 2, serial: "5275220900056" });
  });

  it("reads nothing more while the device holds the same number of punches", async () => {
    const { d, device } = fakeDevice({ punches: [punch("1001", at(25, 8, 52))] });
    const { s, server } = fakeServer();
    const first = await cycle(device, server, EMPTY_STATE);
    await cycle(device, server, first, Date.UTC(2026, 9, 26, 3, 1));
    expect(d.fullReads).toBe(1);
    expect(s.uploads).toHaveLength(1);
    expect(s.handshakes).toBe(1);
  });

  it("sends a new punch with the last day again, which byTeam ignores as already held", async () => {
    const { d, device } = fakeDevice({ punches: [punch("1001", at(20, 8, 0)), punch("1001", at(25, 8, 52))] });
    const { s, server } = fakeServer();
    const first = await cycle(device, server, EMPTY_STATE);
    d.punches.push(punch("1001", at(26, 8, 58)));
    await cycle(device, server, first, Date.UTC(2026, 9, 26, 3, 1));
    expect(s.uploads[1]).toEqual(["1001\t2026-10-25 08:52:00\t0\t1\t0\t0\t0", "1001\t2026-10-26 08:58:00\t0\t1\t0\t0\t0"]);
  });

  it("never lets a punch dated in the future hide later real punches", async () => {
    const { d, device } = fakeDevice({ punches: [punch("1001", { ...at(1, 9, 0), year: 2031 })] });
    const { s, server } = fakeServer();
    const first = await cycle(device, server, EMPTY_STATE);
    expect(first.sentUpTo).toBe("2026-10-26 09:00:00");
    d.punches.push(punch("1001", at(26, 9, 5)));
    await cycle(device, server, first, Date.UTC(2026, 9, 26, 3, 6));
    expect(s.uploads[1]).toContain("1001\t2026-10-26 09:05:00\t0\t1\t0\t0\t0");
  });

  it("adds a person byTeam sends, in a new slot, and reports success", async () => {
    const { d, device } = fakeDevice();
    const { s, server } = fakeServer(parsePollReply("C:7:DATA UPDATE USERINFO PIN=1001\tName=Anwar Hossain\tPri=0"));
    await cycle(device, server, EMPTY_STATE);
    expect(d.users.find((u) => u.userId === "1001")).toMatchObject({ uid: 2, name: "Anwar Hossain", privilege: 0 });
    expect(s.reports).toEqual([[7, 0]]);
  });

  it("renames a person already on the device without touching their privilege, password or card", async () => {
    const { d, device } = fakeDevice();
    const { server } = fakeServer(parsePollReply("C:8:DATA UPDATE USERINFO PIN=1\tName=Arif\tPri=0"));
    await cycle(device, server, EMPTY_STATE);
    expect(d.users).toEqual([{ ...admin, name: "Arif" }]);
  });

  it("reports a command it does not carry out as failed", async () => {
    const { device } = fakeDevice();
    const { s, server } = fakeServer(parsePollReply("C:9:DATA DELETE USERINFO PIN=1001"));
    await cycle(device, server, EMPTY_STATE);
    expect(s.reports).toEqual([[9, RETURN_FAILED]]);
  });

  it("sets the device clock when it is more than 30 seconds off, then checks again an hour later", async () => {
    const { d, device } = fakeDevice({ time: at(26, 9, 4) });
    const { s, server } = fakeServer();
    const state = await cycle(device, server, EMPTY_STATE);
    expect(d.time).toEqual(at(26, 9, 0));
    d.time = at(26, 9, 30);
    await cycle(device, server, state, Date.UTC(2026, 9, 26, 3, 30));
    expect(d.time).toEqual(at(26, 9, 30));
    await cycle(device, server, state, Date.UTC(2026, 9, 26, 3, 0) + CLOCK_CHECK_EVERY_MS);
    expect(d.time).toEqual(at(26, 9, 0));
    // byTeam hears the clock is right after each correction.
    expect(s.clock).toEqual([0, 0]);
  });

  it("leaves a clock within 30 seconds alone, and tells byTeam how far off it is", async () => {
    const { d, device } = fakeDevice({ time: at(26, 9, 0, 25) });
    const { s, server } = fakeServer();
    await cycle(device, server, EMPTY_STATE);
    expect(d.time).toEqual(at(26, 9, 0, 25));
    expect(s.clock).toEqual([25]);
  });

  it("sends nothing when byTeam does not accept the serial number", async () => {
    const { device } = fakeDevice({ punches: [punch("1001", at(25, 8, 52))] });
    const { s, server } = fakeServer([], false);
    await expect(cycle(device, server, EMPTY_STATE)).rejects.toBeInstanceOf(NotRegisteredError);
    expect(s.uploads).toEqual([]);
  });

  it("does not talk to byTeam at all when the device is off, so it shows as offline", async () => {
    const { device } = fakeDevice({ down: true });
    const { s, server } = fakeServer();
    await expect(cycle(device, server, EMPTY_STATE)).rejects.toThrow(/Cannot reach/);
    expect(s).toMatchObject({ handshakes: 0, polls: 0, uploads: [] });
  });

  it("disconnects even when something fails part way", async () => {
    const { d, device } = fakeDevice({ punches: [punch("1001", at(25, 8, 52))] });
    const { server } = fakeServer();
    server.upload = async () => {
      throw new Error("byTeam answered 500");
    };
    await expect(cycle(device, server, EMPTY_STATE)).rejects.toThrow(/500/);
    expect(d.connected).toBe(false);
  });
});

describe("punchesToSend", () => {
  it("keeps punches from a day before the newest one sent, and later", () => {
    const list = [punch("1", at(24, 8, 0)), punch("1", at(25, 9, 0)), punch("1", at(26, 9, 0))];
    expect(punchesToSend(list, "2026-10-26 08:00:00").map((p) => p.time.day)).toEqual([25, 26]);
    expect(punchesToSend(list, null)).toHaveLength(3);
  });
});

describe("userForCommand", () => {
  it("takes the next free slot for a new person", () => {
    expect(userForCommand([admin, { ...admin, uid: 7, userId: "9" }], "1001", "A", 0).uid).toBe(8);
    expect(userForCommand([], "1001", "A", 0).uid).toBe(1);
  });
});
