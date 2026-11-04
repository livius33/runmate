# Phase 7 · Launch — plan

Branch `phase-7-launch` (from `main`). Decisions in [docs/LAUNCH-PLAN.md](../../LAUNCH-PLAN.md).

## Goal

Anyone can run Runmate themselves with `docker compose up` (Postgres in a container) or on Neon + Vercel, the repository
is checked for secrets, and the launch posts are drafted — so the repo can go public on Livius' go.

## Decisions

- **Auth stays Clerk** for self-hosters too (Livius, 2026-11-04): no local password mode. Self-hosters create a free
  Clerk application; `ALLOWED_EMAILS` restricts sign-in.
- **Database driver by URL:** Neon hosts keep the serverless HTTP driver; any other Postgres URL uses node-postgres
  (`pg`, new dependency). `DATABASE_DRIVER=neon|pg` overrides the guess.
- Flipping the repository to public and posting the announcements are Livius' actions, not part of this branch.

## Boundaries

- Owned here: `lib/db/index.ts`, `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `docs/SELF-HOST.md`,
  `docs/launch/`, README (self-host sections), `.env.example` (`DATABASE_DRIVER`), `package.json` (`pg`).
- Not touched: schema and migrations (two port PRs are open), app features, legal texts, billing.

## Acceptance criteria

- **AC-1 driver.** Given a `DATABASE_URL` on `*.neon.tech`, the app uses `neon-http`; given any other Postgres URL
  (e.g. `postgres://runmate@db:5432/runmate`), it uses node-postgres; `DATABASE_DRIVER` overrides. Unit-tested;
  `next build` still works without a database.
- **AC-2 compose.** Given a filled `.env` (Clerk keys, `ENCRYPTION_KEY`, `CRON_SECRET`), when `docker compose up -d`
  runs, then Postgres starts with a volume, a one-shot `migrate` service applies `drizzle/*.sql`, the app serves on
  `http://localhost:3000`, and an optional `cron` service calls `/api/cron/daily-sync` once a day with `CRON_SECRET`.
  Verified locally: migrations applied to the container database, the landing page answers 200.
- **AC-3 docs.** `docs/SELF-HOST.md` covers Docker Compose (Clerk setup, `.env`, update, backup/restore with
  `pg_dump`, the daily sync) and Neon + Vercel; the README links it and no longer calls the Dockerfile untested.
- **AC-4 secrets.** gitleaks over the whole history reports nothing (CI job on `main` green); a pattern scan for
  keys, connection strings and personal data finds only test fixtures; the result is written down.
- **AC-5 announcements.** `docs/launch/ANNOUNCE.md` has drafts for r/selfhosted, Show HN, r/AdvancedRunning,
  r/Garmin, r/laufen and the intervals.icu forum, plus a go-public checklist. Honest: the Garmin login is unofficial
  and experimental, no invented numbers.
- **AC-6 no regression.** `npx tsc --noEmit` and `npm test` green.
