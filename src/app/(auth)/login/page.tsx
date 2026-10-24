import { CalendarCheck, Fingerprint, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { BrandMark } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const points = [
  { icon: Fingerprint, text: "Punches from the device, as they happen" },
  { icon: CalendarCheck, text: "Attendance and leave, worked out for you" },
  { icon: Wallet, text: "A salary sheet at the end of the month" },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-indigo-700 px-6 pb-12 pt-[calc(2rem+env(safe-area-inset-top))] text-forest-foreground md:flex md:flex-col md:justify-between md:px-14 md:py-14">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-acc-teal/45 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute right-1/4 top-1/2 size-56 rounded-full bg-acc-indigo/35 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-acc-lime/30 blur-3xl" />
        <div className="relative flex items-center gap-3 text-xl font-semibold tracking-tight">
          <BrandMark className="size-10" />
          <span className="flex items-baseline">
            <span className="text-white/75">by</span>
            <span>Team</span>
          </span>
        </div>
        <div className="relative mt-10 md:mt-0">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            Know who is in. Pay everyone right.
          </h2>
          <ul className="mt-6 hidden gap-3 md:grid">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="grid size-9 place-items-center rounded-xl bg-white/12">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 hidden text-sm text-white/75 md:block">Attendance, leave and payroll for the office.</p>
      </section>

      <section className="flex items-start justify-center px-4 py-8 md:items-center md:px-10">
        <div className="-mt-6 w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-card md:mt-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use the account the office owner set up for you.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
