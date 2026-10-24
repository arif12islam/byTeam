import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: no session cookie, go to login. It does not prove the
 * session is valid. Pages and server actions check the real session through
 * requireUser and requireRole in src/lib/session.ts.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Leave out the login page, Better Auth's own routes, the device routes
  // (they authenticate by serial number) and the cron route (it checks
  // CRON_SECRET).
  matcher: ["/((?!login|api/auth|api/cron|iclock|_next/static|_next/image|favicon.ico).*)"],
};
