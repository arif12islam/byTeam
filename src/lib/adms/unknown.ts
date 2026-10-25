/**
 * Requests the app does not use, described for the server log so the real
 * firmware's behaviour can be learnt at the pilot. Only shapes that cannot
 * carry arbitrary text are written: anything else is replaced by a marker.
 */

const PATH = /^\/iclock\/[A-Za-z0-9_.\-/]{1,64}$/;
const TABLE = /^[A-Za-z0-9_]{1,32}$/;

/** "/iclock/ping", or "an unusual path" when it is not shaped like one. */
export function safePath(pathname: string): string {
  return PATH.test(pathname) ? pathname : "an unusual path";
}

/** The table name of an upload, like "ATTPHOTO", or "an unusual table". Null when there is none. */
export function safeTable(value: string | null): string | null {
  if (value === null) return null;
  return TABLE.test(value) ? value : "an unusual table";
}
