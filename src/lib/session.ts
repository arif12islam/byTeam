import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "@/lib/auth";
import { assertRole, isUserRole, type UserRole } from "@/lib/roles";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

/** The signed-in user for this request, or null. Reads the session cookie. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Read request data first: it marks this as request-time work, so builds
  // never reach getAuth() and don't need a database.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const { id, name, email } = session.user;
  const role: unknown = session.user.role;
  if (!isUserRole(role)) return null;

  return { id, name, email, role };
});

/** Pages: send visitors without a session to the login screen. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Server actions and data loaders: call this first. The UI hides what a role
 * cannot do, but this is the check that counts. Throws ForbiddenError when the
 * role is not allowed.
 */
export async function requireRole(...allowed: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  assertRole(user.role, allowed);
  return user;
}
