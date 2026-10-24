/** The fields of one ATTLOG line, as text, before any meaning is given to them. */
export type AttlogFields = {
  pin: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM:SS */
  time: string;
  status: string | null;
  verify: string | null;
};

/** Non-empty lines of an upload. Handles Windows line endings and blank lines. */
export function splitLines(body: string): string[] {
  return body
    .replace(/^﻿/, "")
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

const PIN = /^[A-Za-z0-9]{1,24}$/;

/**
 * One ATTLOG line: PIN, date and time, status, verify method, then fields we
 * do not use (work code, reserved). The device separates fields with tabs and
 * writes the date and time as one field, "2026-10-24 09:00:00". If a firmware
 * uses spaces instead, that is read too. Extra fields are ignored. Returns
 * null when the line cannot be a punch.
 */
export function parseAttlogLine(line: string): AttlogFields | null {
  const text = line.trim();
  let pin: string | undefined;
  let date: string | undefined;
  let time: string | undefined;
  let rest: string[];

  if (text.includes("\t")) {
    const fields = text.split("\t").map((f) => f.trim());
    pin = fields[0];
    [date, time] = (fields[1] ?? "").split(/\s+/);
    rest = fields.slice(2);
  } else {
    const tokens = text.split(/\s+/);
    [pin, date, time] = tokens;
    rest = tokens.slice(3);
  }

  if (!pin || !PIN.test(pin) || !date || !time) return null;
  return { pin, date, time, status: rest[0] || null, verify: rest[1] || null };
}
