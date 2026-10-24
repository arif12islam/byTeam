import { getDb } from "@/db";
import { formatCommand } from "@/lib/adms/commands";
import { authenticateDevice, textResponse } from "@/lib/adms/request";
import { claimNextCommand } from "@/lib/devices/queue";

/**
 * Command poll. The device calls this every few seconds: GET
 * /iclock/getrequest?SN=<serial>. The reply is "OK" when there is nothing to
 * do, otherwise the next command as "C:<id>:<command>". The device reports
 * how it went to /iclock/devicecmd.
 */
export async function GET(request: Request) {
  const auth = await authenticateDevice(request, "poll");
  if ("refused" in auth) return auth.refused;

  const next = await claimNextCommand(getDb(), auth.device.serialNo, new Date());
  if (!next) return textResponse("OK");

  console.info(`[iclock] ${auth.device.serialNo} command ${next.id} sent`);
  return textResponse(formatCommand(next.id, next.command));
}
