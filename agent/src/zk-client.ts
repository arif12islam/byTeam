import net from "node:net";

import {
  CMD,
  decodeOption,
  decodePunches,
  decodeSizes,
  decodeUsers,
  decodeZkTime,
  encodePacket,
  encodeUser,
  encodeZkTime,
  FCT_USER,
  FIRST_REPLY_ID,
  type Frame,
  FrameReader,
  makeCommKey,
  MAX_CHUNK,
  prepareBufferRequest,
  readBufferRequest,
  type ZkPunch,
  type ZkSizes,
  type ZkTime,
  type ZkUser,
} from "./zk-protocol";

export type ZkClientOptions = { host: string; port: number; commKey: number; timeoutMs: number };

/**
 * One connection to a device over TCP. Commands run one at a time: each sends a
 * packet and waits for the device's answer. Every read leaves the device as it
 * was: nothing on the device is ever deleted.
 */
export class ZkClient {
  private socket: net.Socket | null = null;
  private reader = new FrameReader();
  private frames: Frame[] = [];
  private waiting: { resolve: (f: Frame) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;
  private sessionId = 0;
  private replyId = FIRST_REPLY_ID;
  private userRecordSize = 72;

  constructor(private readonly options: ZkClientOptions) {}

  async connect(): Promise<void> {
    this.reader = new FrameReader();
    this.frames = [];
    this.failure = null;
    this.sessionId = 0;
    this.replyId = FIRST_REPLY_ID;

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: this.options.host, port: this.options.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`No answer from the device at ${this.options.host}:${this.options.port}. Check the cable and the IP address.`));
      }, this.options.timeoutMs);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`Cannot reach the device at ${this.options.host}:${this.options.port}: ${error.message}`));
      });
      socket.on("data", (chunk) => this.receive(chunk));
      socket.on("error", (error) => this.fail(error));
      socket.on("close", () => this.fail(new Error("The device closed the connection.")));
      this.socket = socket;
    });

    const reply = await this.command(CMD.CONNECT);
    this.sessionId = reply.sessionId;
    if (reply.command === CMD.ACK_UNAUTH) {
      const auth = await this.command(CMD.AUTH, makeCommKey(this.options.commKey, this.sessionId));
      if (auth.command !== CMD.ACK_OK) {
        throw new Error("The device refused the comm key. Set commKey in agent.json to the value under Menu, Comm., PC Connection.");
      }
    } else if (reply.command !== CMD.ACK_OK) {
      throw new Error(`The device refused the connection (code ${reply.command}).`);
    }
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    try {
      await this.command(CMD.EXIT);
    } catch {
      // Closing anyway.
    }
    this.socket = null;
    socket.destroy();
  }

  private receive(chunk: Buffer): void {
    try {
      this.reader.push(chunk);
      for (let frame = this.reader.next(); frame; frame = this.reader.next()) {
        if (this.waiting) {
          const { resolve } = this.waiting;
          this.waiting = null;
          resolve(frame);
        } else {
          this.frames.push(frame);
        }
      }
    } catch (error) {
      this.fail(error as Error);
    }
  }

  private fail(error: Error): void {
    this.failure ??= error;
    if (this.waiting) {
      const { reject } = this.waiting;
      this.waiting = null;
      reject(error);
    }
  }

  /** The next packet from the device, or an error after the timeout. */
  private nextFrame(): Promise<Frame> {
    const queued = this.frames.shift();
    if (queued) return Promise.resolve(queued);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = null;
        reject(new Error("The device stopped answering."));
      }, this.options.timeoutMs);
      this.waiting = {
        resolve: (frame) => {
          clearTimeout(timer);
          resolve(frame);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
    });
  }

  private async command(command: number, data: Uint8Array = new Uint8Array()): Promise<Frame> {
    if (!this.socket) throw new Error("Not connected to the device.");
    const packet = encodePacket(command, this.sessionId, this.replyId, data);
    this.replyId = packet.replyId;
    this.socket.write(packet.bytes);
    const reply = await this.nextFrame();
    this.replyId = reply.replyId;
    return reply;
  }

  private async expectOk(command: number, data?: Uint8Array, what = "do that"): Promise<Frame> {
    const reply = await this.command(command, data);
    // Devices answer a successful command with OK, or with the data straight away.
    if (reply.command !== CMD.ACK_OK && reply.command !== CMD.ACK_DATA && reply.command !== CMD.DATA) {
      throw new Error(`The device could not ${what} (code ${reply.command}).`);
    }
    return reply;
  }

  async sizes(): Promise<ZkSizes> {
    const reply = await this.expectOk(CMD.GET_FREE_SIZES, undefined, "report its sizes");
    return decodeSizes(reply.data);
  }

  async serialNumber(): Promise<string> {
    const reply = await this.expectOk(CMD.OPTIONS_RRQ, Buffer.from("~SerialNumber\0", "ascii"), "report its serial number");
    const serial = decodeOption(reply.data, "~SerialNumber");
    if (!serial) throw new Error("The device did not report a serial number.");
    return serial;
  }

  async time(): Promise<ZkTime> {
    const reply = await this.expectOk(CMD.GET_TIME, undefined, "report its time");
    if (reply.data.length < 4) throw new Error("The device did not report its time.");
    return decodeZkTime(reply.data.readUInt32LE(0));
  }

  async setTime(time: ZkTime): Promise<void> {
    const data = Buffer.alloc(4);
    data.writeUInt32LE(encodeZkTime(time), 0);
    await this.expectOk(CMD.SET_TIME, data, "set its time");
  }

  /**
   * A big read, like the whole punch log. The device either answers at once or
   * says how big the answer is, and is then asked for it in pieces.
   */
  private async readBuffer(command: number, fct = 0): Promise<Buffer> {
    const first = await this.command(CMD.PREPARE_BUFFER, prepareBufferRequest(command, fct));
    if (first.command === CMD.DATA) return first.data;
    if (first.command !== CMD.ACK_OK || first.data.length < 5) {
      throw new Error(`The device could not prepare the data (code ${first.command}).`);
    }

    const size = first.data.readUInt32LE(1);
    const parts: Buffer[] = [];
    for (let start = 0; start < size; start += MAX_CHUNK) {
      parts.push(await this.readChunk(start, Math.min(MAX_CHUNK, size - start)));
    }
    await this.command(CMD.FREE_DATA);
    return Buffer.concat(parts);
  }

  private async readChunk(start: number, size: number): Promise<Buffer> {
    const reply = await this.command(CMD.READ_BUFFER, readBufferRequest(start, size));
    if (reply.command === CMD.DATA) return reply.data;
    if (reply.command !== CMD.PREPARE_DATA || reply.data.length < 4) {
      throw new Error(`The device did not send the data it prepared (code ${reply.command}).`);
    }

    // The piece follows in one or more data packets, then an OK.
    const expected = reply.data.readUInt32LE(0);
    const parts: Buffer[] = [];
    let received = 0;
    while (received < expected) {
      const frame = await this.nextFrame();
      if (frame.command !== CMD.DATA) throw new Error(`The device sent something unexpected while sending data (code ${frame.command}).`);
      parts.push(frame.data);
      received += frame.data.length;
    }
    const done = await this.nextFrame();
    if (done.command !== CMD.ACK_OK) throw new Error(`The device did not finish sending data (code ${done.command}).`);
    return Buffer.concat(parts);
  }

  async users(): Promise<ZkUser[]> {
    const { users: count } = await this.sizes();
    if (count <= 0) return [];
    const data = await this.readBuffer(CMD.USERTEMP_RRQ, FCT_USER);
    const decoded = decodeUsers(data, count);
    this.userRecordSize = decoded.recordSize;
    return decoded.users;
  }

  async punches(users: readonly ZkUser[]): Promise<ZkPunch[]> {
    const { records } = await this.sizes();
    if (records <= 0) return [];
    const data = await this.readBuffer(CMD.ATTLOG_RRQ);
    return decodePunches(data, records, users);
  }

  /** Adds or replaces one user, then asks the device to reload its user list. Call users() first. */
  async writeUser(user: ZkUser): Promise<void> {
    await this.expectOk(CMD.USER_WRQ, encodeUser(user, this.userRecordSize), `save user ${user.userId}`);
    await this.expectOk(CMD.REFRESH_DATA, undefined, "reload its users");
  }
}
