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
  // (they authenticate by serial number), the browser icons (the tab asks for them
  // before anyone signs in), the cron route (it checks
  // CRON_SECRET) and /downloads, which holds only the office agent program: its
  // installer fetches it without signing in, and it contains no secrets.
  matcher: ["/((?!login|api/auth|api/cron|iclock|downloads/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
