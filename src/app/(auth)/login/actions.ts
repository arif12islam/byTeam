"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { describeThrottle, loginThrottle } from "@/lib/login-throttle";
import { ipFromHeaders } from "@/lib/rate-limit";

// email is sent back so the form can keep it: React clears the fields after an action.
export type LoginState = { error?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(formData.get("email") ?? "") };
  }

  const requestHeaders = await headers();
  const ip = ipFromHeaders(requestHeaders);

  // Asked before the password is checked, so a blocked guesser learns nothing, not even from the right password.
  const decision = loginThrottle.check(ip, parsed.data.email);
  if (!decision.allowed) return { error: describeThrottle(decision.retryAfterSeconds), email: parsed.data.email };

  try {
    await getAuth().api.signInEmail({ body: parsed.data, headers: requestHeaders });
  } catch (error) {
    if (error instanceof APIError) {
      loginThrottle.failed(ip, parsed.data.email);
      // Same message for a wrong email and a wrong password.
      return { error: "Email or password is incorrect.", email: parsed.data.email };
    }
    throw error;
  }

  loginThrottle.succeeded(ip, parsed.data.email);
  redirect("/today");
}
