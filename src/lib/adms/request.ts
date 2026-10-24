import { getDb } from "@/db";
import { touchDevice } from "@/lib/devices/receive";

import { readSerial } from "./handshake";
import { admsGuard } from "./rate-limit";

export const textHeaders = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

export function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: textHeaders });
}

/**
 * The first step of every /iclock request: the device must announce a
 * well-formed serial number that is registered and active. That also records
 * the device as just heard from. Requests over the rate limit are turned away
 * first with 429, and unknown devices count against their address. On failure the response to send is returned,
 * and the refusal is logged without writing anything the device sent.
 */
export async function authenticateDevice(
  request: Request,
  what: string,
): Promise<{ device: { id: string; serialNo: string } } | { refused: Response }> {
  const serial = readSerial(new URL(request.url).searchParams.get("SN"));

  const limited = admsGuard.check(request, serial);
  if (limited) {
    console.warn(`[iclock] ${what} turned away: too many requests`);
    return { refused: limited };
  }

  if (!serial) {
    admsGuard.noteRefused(request);
    console.warn(`[iclock] ${what} refused: serial number missing or malformed`);
    return { refused: textResponse("ERROR: serial number missing or invalid\n", 400) };
  }

  const device = await touchDevice(getDb(), serial, new Date());
  if (!device) {
    admsGuard.noteRefused(request);
    console.warn(`[iclock] ${what} refused: ${serial} is not registered or is switched off`);
    return { refused: textResponse("ERROR: device not registered\n", 403) };
  }

  return { device };
}
