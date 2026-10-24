import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 md:p-8">
        <p className="flex items-baseline text-lg font-semibold tracking-tight">
          <span className="text-muted-foreground">by</span>
          <span>Team</span>
        </p>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the account the office owner set up for you.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
