# Phase 7 · Launch — summary

Branch `phase-7-launch`. Plan: [PLAN.md](PLAN.md).

## What shipped

- **Database driver by URL** (`lib/db/index.ts`): `*.neon.tech` keeps `neon-http`; any other Postgres uses
  node-postgres (`pg`, new dependency, pool of 10). `DATABASE_DRIVER=neon|pg` overrides. The app runs no raw SQL,
  transactions or batches, so both drivers serve the same query API.
- **Docker Compose** (`docker-compose.yml`):
  - `db`: Postgres 17 with a volume.
  - `migrate`: a one-shot `drizzle-kit migrate` from the builder stage.
  - `app`: the standalone server, container port fixed to 3000; `PORT` in `.env` only picks the host port.
  - `cron`: busybox crond calls `/api/cron/daily-sync` at 06:00 UTC with `CRON_SECRET`.
  - The Dockerfile takes the `NEXT_PUBLIC_*` values as build args.
- **Client bundle fix:** `lib/feedback/week.ts` (imported by `WeekReview`/`WeekFeedbackOverlay`) lazily imported the
  db module, so webpack put the database driver into the browser bundle. Harmless with Neon's fetch driver, a build
  error with `pg`. The store moved to `lib/feedback/week-store.ts` (server only).
- **Docs:**
  - `docs/SELF-HOST.md`: Clerk, Compose (env table, update, backup/restore, other Postgres, troubleshooting), and
    Neon + Vercel.
  - The README self-host section is now short and links there; the "Dockerfile untested" note is gone.
  - `.env.example` gains `POSTGRES_PASSWORD` and `DATABASE_DRIVER`.
- **Launch drafts** (`docs/launch/ANNOUNCE.md`): a go-public checklist and posts for r/selfhosted, Show HN,
  r/AdvancedRunning, r/Garmin, r/laufen and the intervals.icu forum.
- **CI:** the workouts property test gets a 600 s timeout; the 120 s default timed out on the 2-core GitHub runner and
  made `main` red.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC-1 driver | ✅ | `tests/db/driver.test.ts`; `next build` without env still works (Docker build has no DB) |
| AC-2 compose | ✅ | Local `docker compose up -d --build` (Colima, 4 GB), throwaway `.env`:<br>• migrate exit 0, 5 migrations, 14 tables<br>• `/`, `/en`, `/preise`, `/methoden`, `/sign-in` → 200<br>• `/plan` → 404 without a session (Clerk)<br>• cron route 401 without and 200 with the secret (`usersToSync` over `pg`)<br>Stack, volume and image removed afterwards |
| AC-3 docs | ✅ | `docs/SELF-HOST.md`, README |
| AC-4 secrets | ✅ | gitleaks job on `main`: success (full history)<br>Pattern scan (keys, connection strings, `whsec_`, Clerk/Garmin env values): only test fixtures<br>Personal data: copyright line and test-profile variable names only |
| AC-5 announcements | ✅ | `docs/launch/ANNOUNCE.md` |
| AC-6 no regression | ✅ | `tsc` clean; vitest 70 files / 611 passed + 1 todo |

## Deviations

- Auth stays Clerk for self-hosters (Livius' decision); no local auth path.
- The client-bundle fix and the CI timeout were not in the plan; both were found while verifying.

## For Livius

1. Flip the repo to public (checklist step 4) when ready; set `NEXT_PUBLIC_REPO_URL` on the landing deployment.
2. Post the announcements yourself; edit the drafts to your voice.
3. Still open from earlier phases: the legal placeholders, a mail provider (waitlist, retention), the Plus price, the
   business basics (Gewerbe, Paddle).
