import { markWhatsNewSeenAction } from "@/app/(admin)/whats-new/actions";
import { getCurrentUser } from "@/lib/session";
import { unseenRelease } from "@/lib/whats-new/releases";

import { WhatsNewDialog } from "./dialog";

/**
 * Shows the What's new tour when the signed-in person has not seen the newest
 * release, and nothing otherwise. Reads the session, so render it inside Suspense.
 */
export async function WhatsNewGate() {
  const user = await getCurrentUser();
  if (!user) return null;

  const release = unseenRelease(user.lastSeenRelease);
  if (!release) return null;

  return <WhatsNewDialog release={release} markSeen={markWhatsNewSeenAction} />;
}
