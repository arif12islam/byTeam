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
OWNER_EMAIL=you@example.com OWNER_PASSWORD=choose-a-password npm run seed:owner
npm run dev
```

Open http://localhost:3000 and sign in with the owner account. The seed does nothing if an owner already exists.

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
| `npm run sim` | Pretend to be the attendance device (see below) |
| `npm run seed:owner` | Create the first owner login from `OWNER_EMAIL`, `OWNER_NAME`, `OWNER_PASSWORD` |

## Tests

`npm test` runs everything that needs no database. The tests in `tests/db` use a real Postgres and are skipped unless `DATABASE_URL_TEST` is set to an empty database that has had the migrations applied:

```bash
createdb byteam_test
DATABASE_URL=postgres://localhost/byteam_test npm run db:migrate
DATABASE_URL_TEST=postgres://localhost/byteam_test npm test
```

CI does this with a throwaway Postgres. Never point `DATABASE_URL_TEST` at a real database: the tests add rows, and the punch log can never be cleaned up, by design.

## Trying the device without hardware

The simulator behaves like the face and fingerprint device: it announces itself, sends punches live, sends a delayed batch from an offline period, resends the same batch, and answers commands.

1. Start the app and add a device on the Devices screen with serial number `SIM0000001`.
2. Run `npm run sim -- --url http://localhost:3000`. Add `--verify` to count the stored punches in `DATABASE_URL` and confirm each was stored exactly once. Use `--sn` for another serial number, `--codes 1001,1002` for other employee codes, and `--scenario handshake|live|burst|resend|poll` to run one part.

The same command works against a deployed preview: point `--url` at it and register the serial number there.

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
