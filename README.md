# byTeam

Attendance, leave and payroll for a small office, fed by a ZKTeco face and fingerprint device. Built by Bykorp, first used at the Sand'Sun Holidays office in Dhaka.

- Design: [`docs/DESIGN.md`](docs/DESIGN.md)
- Build plan and milestones: [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md)

## Stack

Next.js (App Router) + TypeScript, PostgreSQL on Neon with Drizzle ORM, Tailwind CSS + shadcn/ui, Vitest. Tested on Vercel Hobby, built to move to a VPS without code changes.

## Local setup

Requirements: Node.js 22 or newer, a free [Neon](https://neon.tech) database.

```bash
git clone https://github.com/arif12islam/byteam.git
cd byteam
npm install
cp .env.example .env.local   # then fill in DATABASE_URL and the secrets
npm run db:migrate
npm run dev
```

Open http://localhost:3000. It redirects to the Today screen.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then run `tsc` |
| `npm test` | Run Vitest once |
| `npm run db:generate` | Create a migration from schema changes |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:studio` | Browse the database |

## Project layout

```
src/app/(admin)/   admin screens (Today, Attendance, Leave, Payroll, ...)
src/app/api/       route handlers, including the nightly cron
src/db/            Drizzle client, schema and migrations
src/lib/           business logic (attendance, leave, payroll, time)
tests/             Vitest tests, mirroring src/lib
docs/              design and build plan
```

Business logic lives in plain functions under `src/lib`, never inside route handlers or components, so it can be tested and moved off Vercel unchanged.

## Deploying to Vercel

1. Import the repo in Vercel.
2. Add `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CRON_SECRET` and `APP_TIMEZONE` under Project Settings > Environment Variables.
3. Deploy. The nightly job in `vercel.json` calls `/api/cron/recalc` at 02:00 Dhaka time.

The ZKTeco device may not support HTTPS, so test the real device against your laptop on the office network. See milestone M7 in the build plan.

## Working conventions

Branches `feat/...`, `fix/...`, `test/...`. Conventional Commits. One issue per PR, CI must pass. Details in the build plan.
