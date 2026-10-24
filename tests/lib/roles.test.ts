import { describe, expect, it } from "vitest";

import { assertRole, canAct, ForbiddenError, isUserRole } from "@/lib/roles";

describe("isUserRole", () => {
  it("accepts owner and hr only", () => {
    expect(isUserRole("owner")).toBe(true);
    expect(isUserRole("hr")).toBe(true);
    expect(isUserRole("admin")).toBe(false);
    expect(isUserRole("OWNER")).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
    expect(isUserRole(null)).toBe(false);
  });
});

describe("canAct", () => {
  it("allows a listed role", () => {
    expect(canAct("hr", ["owner", "hr"])).toBe(true);
    expect(canAct("owner", ["owner"])).toBe(true);
  });

  it("denies a role that is not listed", () => {
    expect(canAct("hr", ["owner"])).toBe(false);
  });

  it("denies unknown or missing roles", () => {
    expect(canAct(undefined, ["owner", "hr"])).toBe(false);
    expect(canAct("admin", ["owner", "hr"])).toBe(false);
  });

  it("denies everyone when nothing is allowed", () => {
    expect(canAct("owner", [])).toBe(false);
  });
});

describe("assertRole", () => {
  it("returns the role when allowed", () => {
    expect(assertRole("owner", ["owner"])).toBe("owner");
  });

  it("throws ForbiddenError when the role is not allowed", () => {
    expect(() => assertRole("hr", ["owner"])).toThrow(ForbiddenError);
  });

  it("throws ForbiddenError for a missing role", () => {
    expect(() => assertRole(undefined, ["owner", "hr"])).toThrow(ForbiddenError);
  });
});
