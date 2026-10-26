/**
 * The agent's side of byTeam's device routes. The agent speaks to byTeam
 * exactly as a push (ADMS) device would, under the device's own serial number,
 * so byTeam needs nothing special for devices behind an agent: the same
 * registration, punch storage, command queue and Devices screen apply.
 */

export const AGENT_VERSION = "1.0.0";

export class NotRegisteredError extends Error {
  constructor(serial: string) {
    super(
      `byTeam does not accept serial number ${serial}. Add it on the Devices screen (exactly as shown here), or switch it on there if it was switched off.`,
    );
    this.name = "NotRegisteredError";
  }
}

export type ServerCommand =
  | { id: number; kind: "user"; pin: string; name: string; privilege: number }
  | { id: number; kind: "unsupported"; text: string };

/**
 * The reply to a command poll: "OK" when there is nothing to do, otherwise one
 * "C:<id>:<command>" line per command. Only adding or updating a user is done
 * by the agent; anything else is reported back as not supported.
 */
export function parsePollReply(text: string): ServerCommand[] {
  const commands: ServerCommand[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    const match = /^C:(\d{1,15}):(.*)$/.exec(line);
    if (!match) continue;
    const id = Number(match[1]);
    const body = match[2];
    const user = /^DATA UPDATE USERINFO (.*)$/.exec(body);
    if (user) {
      const fields = new Map(
        user[1].split("\t").map((part) => {
          const at = part.indexOf("=");
          return at === -1 ? [part, ""] : [part.slice(0, at), part.slice(at + 1)];
        }),
      );
      const pin = fields.get("PIN") ?? "";
      if (pin) {
        commands.push({ id, kind: "user", pin, name: fields.get("Name") ?? pin, privilege: Number(fields.get("Pri") ?? 0) || 0 });
        continue;
      }
    }
    commands.push({ id, kind: "unsupported", text: body });
  }
  return commands;
}

export type Server = {
  /** Tells byTeam the device is there. Throws NotRegisteredError when byTeam refuses the serial number. */
  handshake(serial: string): Promise<void>;
  upload(serial: string, lines: readonly string[]): Promise<void>;
  nextCommands(serial: string): Promise<ServerCommand[]>;
  report(serial: string, id: number, returnCode: number): Promise<void>;
  /** Tells byTeam how far the device clock is from office time, in seconds, positive when ahead. */
  reportClock(serial: string, offsetSeconds: number): Promise<void>;
};

type Fetch = typeof fetch;

export function createServer(baseUrl: string, { fetchImpl = fetch, timeoutMs = 30_000 }: { fetchImpl?: Fetch; timeoutMs?: number } = {}): Server {
  const base = baseUrl.replace(/\/+$/, "");
  const headers = { "User-Agent": `byTeam-agent/${AGENT_VERSION}`, "Content-Type": "text/plain; charset=utf-8" };

  async function call(serial: string, path: string, query: Record<string, string>, body?: string): Promise<string> {
    const params = new URLSearchParams({ SN: serial, ...query });
    const response = await fetchImpl(`${base}/iclock/${path}?${params}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    if (response.status === 403) throw new NotRegisteredError(serial);
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`byTeam answered with a redirect (${response.status}). Check the server address in agent.json starts with https://.`);
    }
    if (!response.ok) throw new Error(`byTeam answered ${response.status}: ${text.trim().slice(0, 200)}`);
    return text;
  }

  return {
    async handshake(serial) {
      await call(serial, "cdata", { options: "all", pushver: "2.4.1", language: "69" });
    },
    async upload(serial, lines) {
      const reply = await call(serial, "cdata", { table: "ATTLOG", Stamp: "9999" }, `${lines.join("\n")}\n`);
      if (reply.trim() !== "OK") throw new Error(`byTeam did not accept the punches: ${reply.trim().slice(0, 200)}`);
    },
    async nextCommands(serial) {
      return parsePollReply(await call(serial, "getrequest", {}));
    },
    async report(serial, id, returnCode) {
      await call(serial, "devicecmd", {}, `ID=${id}&Return=${returnCode}&CMD=DATA\n`);
    },
    async reportClock(serial, offsetSeconds) {
      await call(serial, "cdata", { options: "all", clockOffset: String(Math.round(offsetSeconds)) });
    },
  };
}
