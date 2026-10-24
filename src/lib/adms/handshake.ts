import { SERIAL_PATTERN } from "@/lib/devices/devices";

/**
 * The serial number a device announced in its request, or null when it is
 * missing or not shaped like one. Anything that fails here is never looked up
 * or written to a log, so a request cannot put arbitrary text there.
 */
export function readSerial(value: string | null): string | null {
  if (value === null) return null;
  const serial = value.trim();
  return SERIAL_PATTERN.test(serial) ? serial : null;
}

/** Seconds the device waits between polls for commands, and before retrying after an error. */
export const POLL_DELAY_SECONDS = 30;
export const ERROR_DELAY_SECONDS = 60;

/**
 * The reply to a device's first request after boot: how it should behave.
 * Plain text, one Key=Value per line, in the ZKTeco push (ADMS) format.
 *
 * Only Realtime, Delay and TransFlag matter to us: punches are sent as they
 * happen, the device polls for commands every POLL_DELAY_SECONDS, and only
 * attendance and operation logs are uploaded. ATTLOGStamp=None asks the device
 * to send everything it holds after a restart. That is safe because a resent
 * punch is ignored by the unique key. Field names, their order and the
 * separators in TransFlag come from the common push protocol and must be
 * confirmed against the real firmware at the LAN test (M7).
 */
export function buildHandshakeConfig(serialNo: string): string {
  return [
    `GET OPTION FROM: ${serialNo}`,
    "ATTLOGStamp=None",
    "OPERLOGStamp=None",
    "ATTPHOTOStamp=None",
    `ErrorDelay=${ERROR_DELAY_SECONDS}`,
    `Delay=${POLL_DELAY_SECONDS}`,
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=TransData AttLog\tOpLog",
    "Realtime=1",
    "Encrypt=0",
    "",
  ].join("\n");
}
