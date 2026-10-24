import { USER_ROLES, type UserRole } from "@/db/schema/setup";

export { USER_ROLES, type UserRole };

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** True when the role is a known role and is one of the allowed ones. */
export function canAct(role: unknown, allowed: readonly UserRole[]): boolean {
  return isUserRole(role) && allowed.includes(role);
}

/** Throws ForbiddenError unless the role is allowed. Returns the role, narrowed. */
export function assertRole(role: unknown, allowed: readonly UserRole[]): UserRole {
  if (!isUserRole(role) || !allowed.includes(role)) {
    throw new ForbiddenError();
  }
  return role;
}
