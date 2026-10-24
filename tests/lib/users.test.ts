import { describe, expect, it } from "vitest";

import { newUserSchema } from "@/lib/users";

const valid = { name: "Rahim", email: "rahim@example.com", password: "long-enough", role: "hr" };

describe("newUserSchema", () => {
  it("accepts a valid user", () => {
    expect(newUserSchema.parse(valid)).toEqual(valid);
  });

  it("trims the name and lowercases the email", () => {
    const parsed = newUserSchema.parse({ ...valid, name: "  Rahim ", email: " Rahim@Example.COM " });
    expect(parsed.name).toBe("Rahim");
    expect(parsed.email).toBe("rahim@example.com");
  });

  it("rejects a short password", () => {
    expect(newUserSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("rejects a missing password or email", () => {
    expect(newUserSchema.safeParse({ ...valid, password: undefined }).success).toBe(false);
    expect(newUserSchema.safeParse({ ...valid, email: undefined }).success).toBe(false);
  });

  it("rejects a bad email and an empty name", () => {
    expect(newUserSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(newUserSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });

  it("rejects roles other than owner and hr", () => {
    expect(newUserSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });
});
