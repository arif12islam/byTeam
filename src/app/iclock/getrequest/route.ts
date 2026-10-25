import { getDb } from "@/db";
import { formatCommand } from "@/lib/adms/commands";
import { pollMemo } from "@/lib/adms/quiet-poll";
import { authenticateDevice, textResponse } from "@/lib/adms/request";
import { claimNextCommand } from "@/lib/devices/queue";

/**
 * Command poll. The device calls this every few seconds: GET
 * /iclock/getrequest?SN=<serial>. The reply is "OK" when there is nothing to
 * do, otherwise the next command as "C:<id>:<command>". The device reports
 * how it went to /iclock/devicecmd.
 *
 * Most polls are answered from memory without asking the database, so a
 * database that sleeps when idle can sleep (see `src/lib/adms/quiet-poll.ts`).
 */
export async function GET(request: Request) {
  const auth = await authenticateDevice(request, "poll", { quiet: true });
  if ("refused" in auth) return auth.refused;
  if (auth.fromMemory) return textResponse("OK");

  const next = await claimNextCommand(getDb(), auth.device.serialNo, new Date());
  if (!next) return textResponse("OK");

  // More may be waiting: ask the database again on the next poll instead of going quiet.
  pollMemo.forget(auth.device.serialNo);
  console.info(`[iclock] ${auth.device.serialNo} command ${next.id} sent`);
  return textResponse(formatCommand(next.id, next.command));
}
