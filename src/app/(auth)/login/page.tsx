import type { Metadata } from "next";

import { BrandMark } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <BrandMark />
          byTeam
        </div>
        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-card">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use the account the office owner set up for you.</p>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Attendance, leave and payroll for the office.</p>
      </div>
    </main>
  );
}
