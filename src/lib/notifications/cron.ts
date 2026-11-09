import { getDb } from "@/db";
import { officeMinuteOfDay } from "@/lib/time";

import { runNotificationChecks, type RunSummary } from "./run";

/** Hours (office time) outside of which a check does nothing and does not touch the database. */
export const CHECK_FROM_MINUTE = 7 * 60;
export const CHECK_TO_MINUTE = 21 * 60;

type Deps = {
  now?: () => Date;
  secret?: string | undefined;
  run?: (now: Date) => Promise<RunSummary>;
};

/**
 * The scheduler's request. It must carry the CRON_SECRET, like the nightly job.
 * Outside 07:00 to 21:00 office time it answers at once without asking the
 * database anything, so a scheduler left running all night costs nothing.
 */
export async function handleNotifyRequest(request: Request, deps: Deps = {}): Promise<Response> {
  const secret = "secret" in deps ? deps.secret : process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = (deps.now ?? (() => new Date()))();
  const minute = officeMinuteOfDay(now);
  if (minute < CHECK_FROM_MINUTE || minute > CHECK_TO_MINUTE) {
    return Response.json({ ok: true, skipped: "outside the hours alerts are checked" });
  }

  try {
    const run = deps.run ?? ((at: Date) => runNotificationChecks(getDb(), at));
    return Response.json({ ok: true, ...(await run(now)) });
  } catch (error) {
    console.error("[cron] notification checks failed", error);
    return Response.json({ ok: false, error: "Checks failed" }, { status: 500 });
  }
}
