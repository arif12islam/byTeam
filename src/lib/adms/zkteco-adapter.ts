import { officeDateTimeToInstant } from "@/lib/time";

import { parseAttlogLine, splitLines } from "./parse";

/**
 * One punch in the shape the rest of the app uses, whatever device it came
 * from. A future Hikvision adapter returns the same shape.
 */
export type StandardPunch = {
  deviceSn: string;
  empCode: string;
  punchedAt: Date;
  statusCode: number | null;
  verifyCode: number | null;
  /** The line exactly as received, kept so nothing is lost if the meaning of a field was misread. */
  rawLine: string;
};

/** A small whole number that fits the smallint column, or null. */
function smallInt(value: string | null): number | null {
  if (value === null || !/^-?\d{1,5}$/.test(value)) return null;
  const n = Number(value);
  return n >= -32768 && n <= 32767 ? n : null;
}

/** The device clock is set to the office time zone, so its times are read as Asia/Dhaka. */
export function toStandardPunch(deviceSn: string, line: string): StandardPunch | null {
  const fields = parseAttlogLine(line);
  if (!fields) return null;

  const punchedAt = officeDateTimeToInstant(fields.date, fields.time);
  if (!punchedAt) return null;

  return {
    deviceSn,
    empCode: fields.pin,
    punchedAt,
    statusCode: smallInt(fields.status),
    verifyCode: smallInt(fields.verify),
    rawLine: line.trim(),
  };
}

/**
 * A whole ATTLOG upload. Lines that are not punches are counted and skipped so
 * one bad line never blocks the good ones: the device would resend the batch
 * forever if we refused it.
 */
export function adaptAttlogBody(deviceSn: string, body: string): { punches: StandardPunch[]; skipped: number } {
  const punches: StandardPunch[] = [];
  let skipped = 0;
  for (const line of splitLines(body)) {
    const punch = toStandardPunch(deviceSn, line);
    if (punch) punches.push(punch);
    else skipped += 1;
  }
  return { punches, skipped };
}
