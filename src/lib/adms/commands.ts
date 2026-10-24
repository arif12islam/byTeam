/** A command nobody confirmed is offered again after this long. */
export const RESEND_AFTER_SECONDS = 300;

/** After this many tries without a reply the command is marked failed. */
export const MAX_ATTEMPTS = 3;

/**
 * One command as the device expects it in the reply to a poll: "C:<id>:<command>".
 * The device reports its result against the id. A line break would let one
 * command carry a second, so any is turned into a space.
 */
export function formatCommand(id: number, command: string): string {
  return `C:${id}:${command.replace(/[\r\n]+/g, " ").trim()}`;
}

/** What the device reports for one command it ran. */
export type CommandResult = {
  id: number;
  /** The device's return code. Negative means the command failed. */
  returnCode: number;
  /** The command name the device echoes, such as DATA. Informational only. */
  cmd: string | null;
};

/**
 * The body of a devicecmd upload: one line per command, each written like a
 * query string, "ID=12&Return=0&CMD=DATA". Lines without a usable id and return
 * code are skipped, so one bad line never makes the device resend the rest.
 */
export function parseCommandResults(body: string): CommandResult[] {
  const results: CommandResult[] = [];
  for (const line of body.split(/\r\n|\n|\r/)) {
    const params = new URLSearchParams(line.trim());
    const id = params.get("ID");
    const ret = params.get("Return");
    if (id === null || ret === null || !/^\d{1,15}$/.test(id) || !/^-?\d{1,9}$/.test(ret)) continue;
    const idNumber = Number(id);
    if (idNumber < 1) continue;
    results.push({ id: idNumber, returnCode: Number(ret), cmd: params.get("CMD") });
  }
  return results;
}
