import fs from "node:fs";
import path from "node:path";

import { EMPTY_STATE, punchLine, runCycle, type AgentState } from "./agent";
import { AGENT_VERSION, createServer, NotRegisteredError } from "./byteam";
import { ZkClient } from "./zk-client";
import { officeTime, parseConfig, type Config } from "./config";
import { formatZkTime } from "./zk-protocol";

/**
 * byTeam office agent. Runs on an always-on computer in the office, next to a
 * device that cannot push punches itself (like the ZKTeco K40H). Every minute
 * it reads new punches from the device over the office network and sends them
 * to byTeam, writes new employees to the device, and keeps the device clock
 * right. See docs/OFFICE_AGENT.md.
 *
 *   node byteam-agent.js --config agent.json           run for good
 *   node byteam-agent.js --config agent.json --check   test once and print what it finds
 */

function fail(message: string): never {
  console.error(`\nbyTeam agent: ${message}\n`);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

const configPath = path.resolve(arg("--config") ?? "agent.json");
const folder = path.dirname(configPath);
const statePath = path.join(folder, "agent-state.json");
const logPath = path.join(folder, "agent.log");
const LOG_LIMIT_BYTES = 1_000_000;

/** Prints and keeps a log file next to the settings, starting a fresh one past 1 MB and keeping the previous. */
function log(message: string): void {
  const line = `${formatZkTime(officeTime(config.timeZone))}  ${message}`;
  console.log(line);
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > LOG_LIMIT_BYTES) fs.renameSync(logPath, `${logPath}.1`);
    fs.appendFileSync(logPath, `${line}\n`);
  } catch {
    // Logging must never stop the agent.
  }
}

function loadState(): AgentState {
  try {
    return { ...EMPTY_STATE, ...JSON.parse(fs.readFileSync(statePath, "utf8")) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

function saveState(state: AgentState): void {
  const temp = `${statePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, statePath);
}

let config: Config;
try {
  config = parseConfig(fs.readFileSync(configPath, "utf8"));
} catch (error) {
  fail(`cannot use the settings in ${configPath}: ${(error as Error).message}`);
}

const device = new ZkClient({ ...config.device, timeoutMs: 15_000 });
const server = createServer(config.server);

/** One test run that changes nothing: what the device holds and whether byTeam accepts it. */
async function check(): Promise<void> {
  console.log(`byTeam agent ${AGENT_VERSION}: checking the device at ${config.device.host}:${config.device.port}\n`);
  await device.connect();
  try {
    const serial = await device.serialNumber();
    const sizes = await device.sizes();
    const time = await device.time();
    const users = await device.users();
    const punches = await device.punches(users);
    const office = officeTime(config.timeZone);
    console.log(`Serial number:   ${serial}`);
    console.log(`Users:           ${users.length}`);
    console.log(`Punches stored:  ${sizes.records}`);
    console.log(`Device time:     ${formatZkTime(time)}`);
    console.log(`Office time:     ${formatZkTime(office)}`);
    console.log("\nFirst users on the device (ID, name):");
    for (const u of users.slice(0, 5)) console.log(`  ${u.userId}  ${u.name}`);
    console.log("\nLast punches, as they would be sent to byTeam:");
    for (const p of punches.slice(-5)) console.log(`  ${punchLine(p).replace(/\t/g, "  ")}`);

    try {
      await server.handshake(serial);
      console.log(`\nbyTeam at ${config.server} accepts this device. Everything is ready.`);
    } catch (error) {
      console.log(`\nbyTeam at ${config.server}: ${(error as Error).message}`);
      if (!(error instanceof NotRegisteredError)) console.log("Check this computer has internet access and the server address is right.");
      process.exitCode = 2;
    }
  } finally {
    await device.disconnect();
  }
}

async function runForever(): Promise<void> {
  log(`byTeam agent ${AGENT_VERSION} started. Device ${config.device.host}:${config.device.port}, byTeam ${config.server}, every ${config.pollSeconds} s.`);
  let state = loadState();
  let lastError = "";
  for (;;) {
    try {
      state = await runCycle({ device, server, state, now: Date.now(), officeNow: () => officeTime(config.timeZone), log });
      saveState(state);
      if (lastError) log("Working again.");
      lastError = "";
    } catch (error) {
      const message = (error as Error).message;
      // The same problem every minute is logged once, not hundreds of times.
      if (message !== lastError) log(`Problem: ${message}`);
      lastError = message;
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollSeconds * 1000));
  }
}

if (process.argv.includes("--check")) {
  check().catch((error) => fail((error as Error).message));
} else {
  void runForever();
}
