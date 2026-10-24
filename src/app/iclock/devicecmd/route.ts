import { getDb } from "@/db";
import { parseCommandResults } from "@/lib/adms/commands";
import { authenticateDevice, textResponse } from "@/lib/adms/request";
import { completeCommand } from "@/lib/devices/queue";

/** An upload this large is not a device. */
const MAX_BODY_BYTES = 1_000_000;

/**
 * Command results. After running a command the device reports back: POST
 * /iclock/devicecmd?SN=<serial> with a line like "ID=12&Return=0&CMD=DATA" per
 * command. The reply is always "OK" so the device does not resend, even when a
 * line is unusable or the command is already settled.
 */
export async function POST(request: Request) {
  const auth = await authenticateDevice(request, "command result");
  if ("refused" in auth) return auth.refused;

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return textResponse("ERROR: upload too large\n", 413);
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return textResponse("ERROR: upload too large\n", 413);

  const db = getDb();
  const now = new Date();
  for (const result of parseCommandResults(body)) {
    const updated = await completeCommand(db, auth.device.serialNo, result, now);
    console.info(
      `[iclock] ${auth.device.serialNo} command ${result.id} reported Return=${result.returnCode}${updated ? "" : " (not waiting for a reply, ignored)"}`,
    );
  }

  return textResponse("OK");
}
