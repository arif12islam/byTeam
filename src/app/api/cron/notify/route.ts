import { handleNotifyRequest } from "@/lib/notifications/cron";

/**
 * Checks for things worth a notification: a quiet device, the morning summary,
 * an unknown code. Call it about once an hour in office hours from a free
 * scheduler (see docs/NOTIFICATIONS.md), with the CRON_SECRET as a bearer token.
 */
export async function GET(request: Request) {
  return handleNotifyRequest(request);
}

export async function POST(request: Request) {
  return handleNotifyRequest(request);
}
