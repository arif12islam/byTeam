# byTeam

HR system for a small office: a ZKTeco face and fingerprint device pushes punches over ADMS, and the app turns them into attendance, leave and a monthly salary sheet. Built by Bykorp, first used at the Sand'Sun Holidays office in Dhaka.

Read these before starting any milestone:

- `docs/BUILD_PLAN.md`: milestones M0 to M7, each checkbox is one issue
- `docs/DESIGN.md`: data model, ADMS endpoints, attendance and payroll logic

@AGENTS.md

## Current status

- M0 to M6 done: scaffold, auth and setup, device receiver, attendance engine, leave, payroll, and hardening (office outages, device clock check, rate limits, audit log screen, role checks, empty and error states).
- Vercel and Neon are connected, migrations run on every Vercel build, and the owner can log in.
- Next: M7 real device and pilot. It needs the real ZKTeco device and the office network, so ask the owner before starting.
- When an item is finished, tick it in `docs/BUILD_PLAN.md` in the same change.

## Stack

Next.js 16 (App Router, `cacheComponents` on) + TypeScript, PostgreSQL on Neon, Drizzle ORM with the postgres.js driver, Better Auth (from M1), Tailwind v4 + shadcn/ui, Zod, Vitest. Hosted on Vercel Hobby for testing, moving to a VPS later.

## Commands

```bash
npm run dev          # dev server
npm run lint
npm run typecheck    # next typegen + tsc
npm test             # vitest run; tests/db also needs DATABASE_URL_TEST (see README), CI sets it
npm run build
npm run db:generate  # migration from schema changes
npm run db:migrate   # apply to DATABASE_URL in .env.local
```

Run lint, typecheck, test and build before every commit. CI runs the same four.

## Where things go

- `src/app/(admin)/<screen>/page.tsx`: admin screens
- `src/app/iclock/...`: ADMS device routes (M2)
- `src/app/api/cron/recalc/route.ts`: nightly job, checks `CRON_SECRET`
- `src/db/schema/<group>.ts`: tables, re-exported from `src/db/schema/index.ts`
- `src/db/index.ts`: `getDb()`, server only
- `src/lib/<domain>/`: all business logic as plain functions
- `tests/<domain>/`: Vitest tests mirroring `src/lib`
- `src/components/ui/`: shadcn components

## Rules

- Business logic lives in `src/lib` as pure functions where possible. Route handlers, server actions and components only load data, call those functions and save results.
- Every calculation change (attendance, leave, payroll) ships with a test.
- All dates are office dates in `Asia/Dhaka`. Use the helpers in `src/lib/time.ts`; never use the server's local time.
- `raw_punches` is append-only. Never update or delete a punch. Dedup with the unique key and `onConflictDoNothing`.
- Attendance days and payroll items are derived data and must be rebuildable from inputs.
- Every human change to data writes an `audit_log` row.
- Role checks (`owner`, `hr`) run on the server in every action, not only in the UI.
- Money is `numeric(12,2)`; round net pay to whole taka only at the end.
- No Vercel-specific APIs (Edge Config, KV, Edge runtime) in core code. The app must run with `next start` on a VPS.
- Migrations are generated with drizzle-kit and committed. Never edit an applied migration.
- Pay rules (base, divisor, late policy) are settings in `rule_sets`, never constants in code. Any new pay rule that `docs/BUILD_PLAN.md` section 7 does not cover is not decided: make it configurable or ask.

## Next.js 16 notes

- Check `node_modules/next/dist/docs/` before using an API you are unsure of.
- `cacheComponents` is enabled: code that reads request data, the current time or the database must run at request time (inside `<Suspense>` or after `await connection()`), or the build fails.
- Typed `PageProps` and `LayoutProps` come from `next typegen`.

## UI and copy

- Vivid, bold and phone first. The look is saturated color, never pale on white: page banners, stat tiles, hero panels, buttons, avatars and menu icons are gradients with white text (`accentClasses` in `src/components/accent.ts`, `toneClasses` in `src/components/ui/tone.ts`). The page canvas has soft indigo and emerald washes (`globals.css`). Font is Instrument Sans. Do not drop back to white cards with tiny pastel chips.
- Each screen has its own accent color (Today green, Attendance indigo, Leave violet, Payroll orange, Reports teal, Employees pink, Shifts sky, Devices lime, Settings and Audit slate). Accent colors are decoration only.
- Status colors always mean the same thing (`src/components/ui/tone.ts`): green present or done, amber late, red absent or blocked, blue leave, slate day off or inactive. Pair color with an icon or a word, never color alone. Use `PageHeader`, `Card`, `StatTile`, `Badge`, `Avatar` and `Ring` instead of one-off styling. Charts are plain SVG or CSS, no chart library.
- Design for the phone first: touch targets at least 40px, inputs 16px text on phones, a bottom tab bar under `md`, wide tables become stacked cards on narrow screens.
- Sentence case, plain verbs, no emojis, no em dashes, no all-caps labels.
- Buttons say what they do ("Save shift", "Approve leave"). Empty states tell the user what to do next.
- Must work at phone width.

## Git

- Branches: `feat/<name>`, `fix/<name>`, `test/<name>`. One build-plan item per PR.
- Conventional Commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`.
