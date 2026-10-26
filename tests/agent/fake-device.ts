import net from "node:net";

import {
  checksum,
  CMD,
  decodeUsers,
  decodeZkTime,
  encodeUser,
  encodeZkTime,
  FCT_USER,
  FrameReader,
  makeCommKey,
  type Frame,
  type ZkPunch,
  type ZkTime,
  type ZkUser,
} from "../../agent/src/zk-protocol";

/**
 * A pretend ZKTeco device on a local TCP port, speaking the device side of the
 * protocol: what the office agent talks to in tests. It can answer big reads in
 * one packet or in pieces, cut its replies into tiny TCP writes, and ask for a
 * comm key, so the agent is tested against each way real firmware behaves.
 */
export type FakeDeviceOptions = {
  serial?: string;
  users?: ZkUser[];
  punches?: ZkPunch[];
  time?: ZkTime;
  commKey?: number;
  userRecordSize?: 28 | 72;
  punchRecordSize?: 8 | 16 | 40;
  /** Answer big reads with a size first and the data in pieces, as most firmware does. */
  chunked?: boolean;
  /** Send every reply a few bytes at a time. */
  dribble?: boolean;
};

export type FakeDevice = {
  port: number;
  state: { users: ZkUser[]; punches: ZkPunch[]; time: ZkTime; connections: number; commands: number[] };
  close(): Promise<void>;
};

function reply(command: number, sessionId: number, replyId: number, data: Buffer = Buffer.alloc(0)): Buffer {
  const unsigned = Buffer.alloc(8);
  unsigned.writeUInt16LE(command, 0);
  unsigned.writeUInt16LE(sessionId, 4);
  unsigned.writeUInt16LE(replyId, 6);
  const header = Buffer.from(unsigned);
  header.writeUInt16LE(checksum(Buffer.concat([unsigned, data])), 2);
  const top = Buffer.alloc(8);
  top.writeUInt16LE(0x5050, 0);
  top.writeUInt16LE(0x7d82, 2);
  top.writeUInt32LE(8 + data.length, 4);
  return Buffer.concat([top, header, data]);
}

function encodePunch(p: ZkPunch, size: 8 | 16 | 40, users: readonly ZkUser[]): Buffer {
  if (size === 8) {
    const b = Buffer.alloc(8);
    b.writeUInt16LE(users.find((u) => u.userId === p.userId)?.uid ?? Number(p.userId), 0);
    b.writeUInt8(p.verify, 2);
    b.writeUInt32LE(encodeZkTime(p.time), 3);
    b.writeUInt8(p.state, 7);
    return b;
  }
  if (size === 16) {
    const b = Buffer.alloc(16);
    b.writeUInt32LE(Number(p.userId), 0);
    b.writeUInt32LE(encodeZkTime(p.time), 4);
    b.writeUInt8(p.verify, 8);
    b.writeUInt8(p.state, 9);
    return b;
  }
  const b = Buffer.alloc(40);
  b.writeUInt16LE(users.find((u) => u.userId === p.userId)?.uid ?? 0, 0);
  b.write(p.userId, 2, 24, "utf8");
  b.writeUInt8(p.verify, 26);
  b.writeUInt32LE(encodeZkTime(p.time), 27);
  b.writeUInt8(p.state, 31);
  return b;
}

/** A table as the device sends it: its size in bytes, then the records. */
function table(records: Buffer[]): Buffer {
  const body = Buffer.concat(records);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length, 0);
  return Buffer.concat([size, body]);
}

export async function startFakeDevice(options: FakeDeviceOptions = {}): Promise<FakeDevice> {
  const serial = options.serial ?? "5275220900056";
  const userSize = options.userRecordSize ?? 72;
  const punchSize = options.punchRecordSize ?? 40;
  const state = {
    users: [...(options.users ?? [])],
    punches: [...(options.punches ?? [])],
    time: options.time ?? { year: 2026, month: 10, day: 26, hour: 9, minute: 0, second: 0 },
    connections: 0,
    commands: [] as number[],
  };
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    state.connections += 1;
    const reader = new FrameReader();
    const sessionId = 0x1234;
    let authed = !options.commKey;
    let prepared: Buffer | null = null;

    const send = (bytes: Buffer) => {
      if (!options.dribble) return void socket.write(bytes);
      for (let i = 0; i < bytes.length; i += 3) socket.write(bytes.subarray(i, i + 3));
    };

    const handle = (frame: Frame) => {
      state.commands.push(frame.command);
      const ok = (data?: Buffer) => send(reply(CMD.ACK_OK, sessionId, frame.replyId, data));
      if (!authed && frame.command !== CMD.CONNECT && frame.command !== CMD.AUTH) {
        return send(reply(CMD.ACK_UNAUTH, sessionId, frame.replyId));
      }

      switch (frame.command) {
        case CMD.CONNECT:
          return send(reply(authed ? CMD.ACK_OK : CMD.ACK_UNAUTH, sessionId, frame.replyId));
        case CMD.AUTH:
          authed = frame.data.equals(makeCommKey(options.commKey ?? 0, sessionId));
          return send(reply(authed ? CMD.ACK_OK : CMD.ACK_UNAUTH, sessionId, frame.replyId));
        case CMD.EXIT:
          ok();
          return void socket.end();
        case CMD.GET_FREE_SIZES: {
          const data = Buffer.alloc(92);
          data.writeInt32LE(state.users.length, 16);
          data.writeInt32LE(state.punches.length, 32);
          return ok(data);
        }
        case CMD.OPTIONS_RRQ:
          return ok(Buffer.from(`~SerialNumber=${serial}\0`, "ascii"));
        case CMD.GET_TIME: {
          const data = Buffer.alloc(4);
          data.writeUInt32LE(encodeZkTime(state.time), 0);
          return ok(data);
        }
        case CMD.SET_TIME:
          state.time = decodeZkTime(frame.data.readUInt32LE(0));
          return ok();
        case CMD.PREPARE_BUFFER: {
          const what = frame.data.readInt16LE(1);
          const fct = frame.data.readInt32LE(3);
          prepared =
            what === CMD.USERTEMP_RRQ && fct === FCT_USER
              ? table(state.users.map((u) => encodeUser(u, userSize)))
              : table(state.punches.map((p) => encodePunch(p, punchSize, state.users)));
          if (!options.chunked) return send(reply(CMD.DATA, sessionId, frame.replyId, prepared));
          const data = Buffer.alloc(5);
          data.writeUInt32LE(prepared.length, 1);
          return ok(data);
        }
        case CMD.READ_BUFFER: {
          const start = frame.data.readInt32LE(0);
          const size = frame.data.readInt32LE(4);
          const piece = (prepared ?? Buffer.alloc(0)).subarray(start, start + size);
          const head = Buffer.alloc(4);
          head.writeUInt32LE(piece.length, 0);
          send(reply(CMD.PREPARE_DATA, sessionId, frame.replyId, head));
          for (let i = 0; i < piece.length; i += 1024) send(reply(CMD.DATA, sessionId, frame.replyId, piece.subarray(i, i + 1024)));
          return ok();
        }
        case CMD.FREE_DATA:
          prepared = null;
          return ok();
        case CMD.USER_WRQ: {
          const [user] = decodeUsers(Buffer.concat([Buffer.from([userSize, 0, 0, 0]), frame.data]), 1).users;
          state.users = [...state.users.filter((u) => u.uid !== user.uid), user];
          return ok();
        }
        case CMD.REFRESH_DATA:
          return ok();
        default:
          return send(reply(CMD.ACK_ERROR, sessionId, frame.replyId));
      }
    };

    socket.on("data", (chunk) => {
      reader.push(chunk);
      for (let frame = reader.next(); frame; frame = reader.next()) handle(frame);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    state,
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
