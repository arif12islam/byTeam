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
