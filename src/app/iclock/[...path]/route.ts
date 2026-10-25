import { readSerial } from "@/lib/adms/handshake";
import { admsGuard } from "@/lib/adms/rate-limit";
import { textResponse } from "@/lib/adms/request";
import { safePath } from "@/lib/adms/unknown";

/**
 * Any other /iclock address. Some firmware also calls addresses like
 * /iclock/ping or /iclock/registry. None of them carry punches, so the reply is
 * "OK" (a 404 can make a device report a server error and back off), and the
 * address is logged so the real device's behaviour shows in the server logs.
 * Nothing is read from the database or stored.
 */
async function answer(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const serial = readSerial(url.searchParams.get("SN"));
  const limited = admsGuard.check(request, serial);
  if (limited) return limited;

  console.info(`[iclock] ${serial ?? "no serial number"} ${request.method} ${safePath(url.pathname)}: not used, answered OK`);
  return textResponse("OK");
}

export const GET = answer;
export const POST = answer;
