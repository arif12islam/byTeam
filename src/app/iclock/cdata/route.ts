import { getDb } from "@/db";
import { buildHandshakeConfig, readSerial } from "@/lib/adms/handshake";
import { touchDevice } from "@/lib/devices/receive";

const textHeaders = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

/**
 * Handshake. The device calls this when it starts and whenever it reconnects:
 * GET /iclock/cdata?SN=<serial>&options=all. No login: the serial number must
 * be registered and active on the Devices screen.
 */
export async function GET(request: Request) {
  const serial = readSerial(new URL(request.url).searchParams.get("SN"));
  if (!serial) {
    console.warn("[iclock] handshake refused: serial number missing or malformed");
    return new Response("ERROR: serial number missing or invalid\n", { status: 400, headers: textHeaders });
  }

  const device = await touchDevice(getDb(), serial, new Date());
  if (!device) {
    console.warn(`[iclock] handshake refused: ${serial} is not registered or is switched off`);
    return new Response("ERROR: device not registered\n", { status: 403, headers: textHeaders });
  }

  return new Response(buildHandshakeConfig(device.serialNo), { status: 200, headers: textHeaders });
}
