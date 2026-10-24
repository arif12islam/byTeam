import { getDb } from "@/db";
import { buildHandshakeConfig, readSerial } from "@/lib/adms/handshake";
import { splitLines } from "@/lib/adms/parse";
import { recalcForNewPunches } from "@/lib/attendance/triggers";
import { savePunches } from "@/lib/adms/store";
import { adaptAttlogBody } from "@/lib/adms/zkteco-adapter";
import { touchDevice } from "@/lib/devices/receive";

const textHeaders = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

/** An upload this large is not a device. Vercel refuses bodies over 4.5 MB anyway. */
const MAX_BODY_BYTES = 5_000_000;

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

/**
 * Uploads from the device: POST /iclock/cdata?SN=<serial>&table=ATTLOG with one
 * punch per line, or table=OPERLOG, which is acknowledged and not used. The
 * reply must be "OK" or the device keeps resending the batch, so lines that
 * are not punches are skipped and counted, not refused.
 * A database error is the one case that returns an error: the device tries
 * again later and nothing is lost.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const serial = readSerial(url.searchParams.get("SN"));
  if (!serial) {
    console.warn("[iclock] upload refused: serial number missing or malformed");
    return new Response("ERROR: serial number missing or invalid\n", { status: 400, headers: textHeaders });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return new Response("ERROR: upload too large\n", { status: 413, headers: textHeaders });
  }

  const db = getDb();
  const device = await touchDevice(db, serial, new Date());
  if (!device) {
    console.warn(`[iclock] upload refused: ${serial} is not registered or is switched off`);
    return new Response("ERROR: device not registered\n", { status: 403, headers: textHeaders });
  }

  const table = url.searchParams.get("table");
  if (table !== "ATTLOG" && table !== "OPERLOG") {
    // Photos, user lists and the like are not used. Say OK so the device moves on.
    return new Response("OK", { status: 200, headers: textHeaders });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return new Response("ERROR: upload too large\n", { status: 413, headers: textHeaders });
  }

  if (table === "OPERLOG") {
    // Admin and user changes made on the device. Not used: only the count is logged, never the content.
    console.info(`[iclock] ${device.serialNo} OPERLOG: ${splitLines(body).length} lines received, not used`);
    return new Response("OK", { status: 200, headers: textHeaders });
  }

  const { punches, skipped } = adaptAttlogBody(device.serialNo, body);
  const { received, inserted, newPunches } = await savePunches(db, punches);
  // Punches are saved. Bringing attendance up to date must never make the device resend them.
  await recalcForNewPunches(db, newPunches);
  console.info(
    `[iclock] ${device.serialNo} ATTLOG: ${received} punches, ${inserted} new, ${received - inserted} already held, ${skipped} lines skipped`,
  );

  return new Response("OK", { status: 200, headers: textHeaders });
}
