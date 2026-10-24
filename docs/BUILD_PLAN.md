# Build Plan: byTeam (MVP)

byTeam is a Bykorp HR system, starting as an internal tool for the Sand'Sun office. A ZKTeco face and fingerprint device pushes punches over ADMS, and the app turns them into attendance, leave and a monthly salary sheet.

Full design: `docs/DESIGN.md` (copy of the MVP design doc).

---

## 1. Stack

| Layer | Choice |
| --- | --- |
| App | Next.js (App Router) + TypeScript |
| Database | PostgreSQL on Neon (free tier) |
| ORM | Drizzle ORM + drizzle-kit migrations |
| Auth | Better Auth, email + password, roles: `owner`, `hr` |
| UI | Tailwind CSS + shadcn/ui + TanStack Table |
| Validation | Zod |
| Exports | exceljs (salary sheet), @react-pdf/renderer (payslips) |
| Dates | date-fns + date-fns-tz, all business logic in `Asia/Dhaka` |
| Tests | Vitest |
| Hosting (testing) | Vercel Hobby + Neon |
| CI | GitHub Actions |

Rules for staying portable (so moving to a VPS later is just `next start`):

- Core logic lives in plain functions under `src/lib`, with no Vercel-specific APIs.
- The nightly job is a normal API route that any cron can call.
- No Edge Config, Vercel KV or Edge runtime in the core.

---

## 2. Repo structure

```
byteam/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (admin)/
│  │  │  ├─ today/
│  │  │  ├─ employees/
│  │  │  ├─ attendance/
│  │  │  ├─ leave/
│  │  │  ├─ payroll/
│  │  │  ├─ settings/
│  │  │  ├─ rules/
│  │  │  └─ audit/
│  │  ├─ iclock/
│  │  │  ├─ cdata/route.ts          # handshake (GET) + punches (POST)
│  │  │  ├─ getrequest/route.ts     # command polling
│  │  │  └─ devicecmd/route.ts      # command results
│  │  └─ api/
│  │     ├─ auth/[...all]/route.ts
│  │     └─ cron/recalc/route.ts    # nightly recalculation
│  ├─ db/
│  │  ├─ schema/                    # one file per table group
│  │  ├─ index.ts                   # db client
│  │  └─ migrations/
│  ├─ lib/
│  │  ├─ adms/
│  │  │  ├─ parse.ts                # ATTLOG line parser
│  │  │  ├─ zkteco-adapter.ts       # raw line -> standard punch
│  │  │  └─ commands.ts             # build device commands
│  │  ├─ attendance/
│  │  │  ├─ compute-day.ts          # pure: inputs -> attendance day
│  │  │  ├─ recalc.ts               # load inputs, run compute-day, save
│  │  │  └─ outage.ts               # office outage windows
│  │  ├─ leave/balance.ts
│  │  ├─ payroll/
│  │  │  ├─ compute.ts              # pure: month inputs -> payroll item
│  │  │  └─ rules.ts                # rule set resolution by month
│  │  ├─ exports/
│  │  │  ├─ payslip-pdf.tsx
│  │  │  └─ salary-sheet.ts
│  │  ├─ auth.ts
│  │  ├─ audit.ts
│  │  └─ time.ts                    # Asia/Dhaka helpers
│  └─ components/
├─ scripts/
│  ├─ simulator.ts                  # fake ZKTeco device
│  └─ seed.ts                       # fake employees + a month of punches
├─ tests/
│  ├─ fixtures/                     # one JSON per test employee
│  ├─ attendance/
│  ├─ payroll/
│  └─ adms/
├─ docs/
│  ├─ DESIGN.md
│  └─ DEVICE_SETUP.md
├─ .github/workflows/ci.yml
├─ drizzle.config.ts
├─ vercel.json
├─ .env.example
└─ README.md
```

---

## 3. Environment

`.env.example`

```
DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=change-me
BETTER_AUTH_URL=http://localhost:3000
CRON_SECRET=change-me
APP_TIMEZONE=Asia/Dhaka
```

`package.json` scripts

```
dev          next dev
build        next build
start        next start
lint         next lint
typecheck    tsc --noEmit
test         vitest run
db:generate  drizzle-kit generate
db:migrate   drizzle-kit migrate
db:seed      tsx scripts/seed.ts
sim          tsx scripts/simulator.ts
```

`vercel.json` (Hobby allows one daily cron; 20:00 UTC is 02:00 Dhaka)

```json
{
  "crons": [{ "path": "/api/cron/recalc", "schedule": "0 20 * * *" }]
}
```

The cron route checks `Authorization: Bearer ${CRON_SECRET}`.

---

## 4. Milestones

Each milestone is a GitHub milestone. Each checkbox is one issue and one PR. A milestone is closed only when its "Done when" passes.

### M0: Repo setup

- [x] Create Next.js app with TypeScript, Tailwind, ESLint
- [x] Add shadcn/ui, base layout with sidebar for admin screens
- [x] Add Drizzle + Neon connection, first empty migration
- [x] Add Vitest with one sample test
- [x] GitHub Actions: install, lint, typecheck, test on every PR
- [ ] Connect repo to Vercel, set env vars, confirm preview deploys
- [x] `README.md` with local setup steps
- [x] Copy design doc into `docs/DESIGN.md`

**Done when:** a PR runs CI green and gets a Vercel preview URL.

### M1: Foundation

- [x] Schema: `users`, `company_settings`, `holidays`, `shifts`, `employees`, `salary_structures`, `audit_log`
- [x] Better Auth with `owner` and `hr` roles, server-side role checks helper
- [ ] Seed first owner account via script
- [x] Settings screen: company, weekly off days, holidays
- [ ] Shifts screen: name, start, end, grace minutes
- [ ] Employees screen: list, create, edit, deactivate, assign shift
- [ ] Salary structure form with effective-from month
- [ ] `audit()` helper, used on every create and update above

**Done when:** HR can log in, add employees with shifts and salaries, and each change appears in `audit_log`.

### M2: Device integration

- [ ] Schema: `devices`, `raw_punches` (unique on device_sn + emp_code + punched_at), `device_commands`
- [ ] Devices screen: add serial number, show last seen, online or offline (offline after 15 min)
- [ ] `GET /iclock/cdata` handshake: reject unknown serial, update last seen, return config
- [ ] `POST /iclock/cdata?table=ATTLOG`: parse lines, adapter to standard punch, insert with `onConflictDoNothing`, reply `OK`
- [ ] Accept and log `OPERLOG` without using it
- [ ] `GET /iclock/getrequest`: return next pending command or `OK`
- [ ] `POST /iclock/devicecmd`: mark command done or failed
- [ ] Queue a user-update command when an employee is created or edited
- [ ] Unmatched punches (unknown emp_code) listed for HR
- [ ] `scripts/simulator.ts`: handshake, live punches, delayed offline burst, duplicate resend
- [ ] Tests: parser handles tabs, extra fields, blank lines; dedup holds

**Done when:** the simulator against a Vercel preview stores every punch exactly once, including a resent batch.

### M3: Attendance engine

- [ ] Schema: `attendance_days`, `attendance_adjustments`
- [ ] `computeDay()` as a pure function: day type, first in, last out, late, early, missing out, worked on off day
- [ ] `recalc(employeeIds, dateRange)` that loads inputs and saves results
- [ ] Trigger recalc on: new punch batch, adjustment, shift change
- [ ] Nightly `/api/cron/recalc` for the previous day
- [ ] Today screen: in, late, absent, on leave, device status
- [ ] Attendance screen: monthly grid per employee, day detail with raw punches
- [ ] Manual adjustment with required reason, audited
- [ ] Excel export of the monthly grid
- [ ] `scripts/seed.ts`: 6 to 8 employees, one full month of punches covering every case
- [ ] Tests: one fixture per seeded employee with the expected month grid

**Done when:** the seeded month matches the hand-made expected grid for every employee.

### M4: Leave

- [ ] Schema: `leave_types`, `leave_requests`
- [ ] Leave types screen: name, yearly quota, paid or unpaid
- [ ] Leave request form for HR, day count skipping off days and holidays
- [ ] Approve, reject, cancel; each triggers recalc for the covered dates
- [ ] Balance per employee per type for the calendar year
- [ ] Block approval beyond balance unless recorded as unpaid
- [ ] Tests: balance math, leave overriding absent, off days not counted

**Done when:** approving leave turns those absent days into leave in the grid, and balances are correct.

### M5: Payroll

- [ ] Schema: `rule_sets`, `payroll_runs`, `payroll_items`, `payroll_adjustments`
- [ ] Rules screen (owner edits, HR views): grace, late mode, late every N, deduction base, divisor, effective month
- [ ] `computePayroll()` as a pure function with a full breakdown object
- [ ] Mid-month join and exit pro-rating
- [ ] Payroll screen: create draft run, review sheet, add bonus and advance, recompute
- [ ] Finalize (owner): snapshot rule set, lock month's attendance and leave
- [ ] Unlock (owner): reason required, audited
- [ ] Payslip PDF per employee
- [ ] Salary sheet Excel export
- [ ] Tests: expected pay per seed employee from a spreadsheet, as golden tests

**Done when:** every seeded employee's net pay matches the spreadsheet to the taka, and a finalized month cannot be edited.

### M6: Hardening

- [ ] Office outage action: date + time window, skips late and absent marking for everyone in it, one audit entry
- [ ] Clock drift check: compare device time with received time, flag device if over 5 minutes
- [ ] Rate limit `/iclock` routes
- [ ] Audit log screen with filters
- [ ] Empty states, loading states, error messages on all screens
- [ ] Review all role checks on server actions

**Done when:** a simulated outage day produces no wrong late or absent marks, and an HR user cannot finalize, unlock or edit rules.

### M7: Real device and pilot

- [ ] Write `docs/DEVICE_SETUP.md`: network, ADMS server address, poll interval 30 to 60 s, real-time upload on
- [ ] LAN test: app on laptop, device pointed at laptop IP and port
- [ ] Compare real ATTLOG lines with the simulator, fix parser if needed
- [ ] Test enroll, punch, Wi-Fi off and on, server restart, user push from app
- [ ] Put device and router on a mini DC UPS
- [ ] Run one full month in parallel with the current attendance method
- [ ] Write the VPS migration checklist (Nginx, plain HTTP for `/iclock`, HTTPS for admin, system cron, daily `pg_dump`)

**Done when:** one real month of attendance and payroll matches the current method with no manual fixes beyond genuine ones.

---

## 5. Working conventions

- **Branches:** `feat/<short-name>`, `fix/<short-name>`, `test/<short-name>`
- **Commits:** Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`)
- **PRs:** one issue per PR, linked with `Closes #<n>`, CI must pass, preview checked
- **Main branch:** protected, no direct pushes
- **Labels:** `area:device`, `area:attendance`, `area:leave`, `area:payroll`, `area:ui`, `area:infra`, `type:feature`, `type:bug`, `type:test`, `priority:p1`, `priority:p2`
- **Migrations:** always generated by drizzle-kit and committed; never edit an applied migration

## 6. Definition of done (every issue)

- Works in the Vercel preview
- Typecheck, lint and tests pass in CI
- Any calculation change has a test
- Any human change to data writes an audit entry
- No business logic inside route handlers or components; it lives in `src/lib`

## 7. Open decisions before M5

- [ ] Absent deduction base: gross or basic
- [ ] Divisor: 30, days in month, or working days
- [ ] Late policy: grace minutes, lates per deducted day
- [ ] Weekly off days
- [ ] Leave quotas per type, calendar year or joining anniversary
