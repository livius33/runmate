# Runmate — notes for AI coding agents

Adaptive running-plan app: activity data in (Garmin login, Apple Health, file import — all behind one adapter), a training plan generated from methodology templates and adapted
by a rule engine out. UI is German; code, comments and docs are English.

- **Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, Drizzle ORM, Neon Postgres, Clerk auth, Vercel hosting.
- **Licence:** AGPL-3.0. Never add code you cannot license under it.

## Key directories

```
app/onboarding/, app/demo/ — first-run flow (Phase 5); read-only demo pages + /demo/api dispatcher (DEMO_MODE=1)
app/(dashboard)/         — pages: /plan (Plan; signed-in visits to / land here), /plan/neu, /plan/anpassen, /running (Analyse), /running/activities, /season, /race, /settings
app/(marketing)/         — public static landing (Phase 6): / (de), /en, /preise, /methoden/[id], /warteliste; no Clerk, no React Query
app/(legal)/             — public pages without Clerk: /impressum, /datenschutz, /agb, /kuendigen (§312k BGB)
app/api/                 — API routes (sources/*, import, running/*, season, calendar + health token routes, cron)
components/              — runs/, analyse/, plan/, settings/
lib/db/                  — Neon connection (lazy), Drizzle schema, owned.ts (own/mine), settings.ts (per-user key/value)
lib/scope.ts, lib/server/scope.ts — per-request user scope (user id, profile, live blocks); withUser/runAsUser
lib/profile.ts           — the runner's profile (HFmax, rest, LTHR, zone model, PB, weight, time zone) + defaults
lib/billing/              — entitlements (pure), access (server checks), Paddle (fetch + webhook signature), webhook, cancel
lib/legal/, lib/account/  — Art. 9 consent + intake gate; export / deletion over every user table, Svix verification
lib/sources/              — data sources: types.ts (ActivitySource contract), registry.ts, ingest.ts (the only writer of
                           source activities; dedupe.ts), sync.ts; garmin-login/ (unofficial, per user, encrypted),
                           garmin-api.ts (placeholder), apple-health.ts, file/ (FIT/GPX/TCX/ZIP parsers, browser batching)
lib/wellness/            — nights (sleep, HRV, resting HR): store.ts (wellness_days + Apple sleep fallback), sync.ts
                           (the wellness step of a pull source's sync, via ActivitySource.fetchNight)
lib/vendor/garmin-connect/ — fork of the unmaintained garmin-connect 1.6.2 (MIT, own LICENSE; never logs tokens)
lib/analytics/           — hr.ts (the one HR model, from the profile), run-metrics, load (TRIMP, CTL/ATL/TSB, ACWR), progress
lib/plan/                — blocks registry, generator/, methodology/, engine, effective (edits), pause, events, race week/day
lib/plan/plan-files.ts   — hand-written plan files that are always registered (empty by default)
lib/insights/, lib/feedback/ — card texts and feedback rules (pure)
methodologies/           — templates (Markdown + YAML); research/ = the evidence behind the rules
examples/porto-2026/     — example hand-written block + its template (used by the tests)
tests/                   — Vitest, pure logic only; tests/setup.ts registers the example block
drizzle/                 — generated SQL migrations (drizzle-kit); 0000_baseline.sql = the whole schema
scripts/                 — backfill-run-metrics.mts, check-methodologies.mts, simulate-plan.mts, snapshot-plan.mts
```

## Rules

- Use `pgTable` (Postgres). After schema changes: `npm run db:generate -- --name <change>`, review and commit the SQL in
  `drizzle/`, then `npm run db:migrate`.
- Multi-user: every table has `user_id`; every query filters with `own(table, …)` / inserts with `mine({...})`
  (`lib/db/owned.ts`). A query that must span users carries a `// cross-user: <why>` comment on the line before it.
  `tests/db/scoping.test.ts` enforces this.
- Every user API route is wrapped in `withUser` (lib/server/scope.ts); public routes (cron, secret links) resolve the
  user and use `runAsUser`. Never keep per-user state in module variables: put it in the scope (`currentScope()`).
- Never hard-code HR values or the time zone: `hrZones()`, `hrMax()`, `raceHr()` (lib/analytics/hr.ts), `athlete()`
  (lib/athlete.ts) and `todayLocal()` (lib/dates.ts) follow the current user's profile. Call them inside functions,
  never at module level.
- Secrets (Garmin login/session) are encrypted with `ENCRYPTION_KEY` (lib/crypto.ts), never logged, never returned.
  Source errors reach users and logs only as `SourceError` (code + German message), never as library output.
- Data sources: implement `ActivitySource` (lib/sources/types.ts) and register it; store activities only through
  lib/sources/ingest.ts (`source` + `source_activity_id`, cross-source dedupe: the richer record replaces the stored one in
  place and keeps the runner's RPE, run type override and feedback; otherwise the duplicate is skipped). Never read a source-specific id column.
  `tests/sources/contract.test.ts` runs every registered source against fixtures.
- The block registry starts empty. Code must work with no block (`hasBlocks()`, `NO_BLOCK`) and must not special-case a
  block id; use block properties (`handWritten`, `base`, `paces`, `engine`).
- After changing `lib/analytics/run-metrics.ts`: bump `METRICS_VERSION` and run
  `npx tsx --env-file=.env.local scripts/backfill-run-metrics.mts --metrics`.
- Keep `npx tsc --noEmit` and `npm test` green. `next build` must work without a database.
- No personal data in code, tests or fixtures.
- Local dev runs on port 3001 (`npm run dev`).
- Billing (Phase 4): what a user may do comes only from `lib/billing/entitlements.ts`; check it on the server with
  `requireFeature()` / `currentEntitlements()` (lib/billing/access.ts), never by reading the subscription row. Without
  `BILLING_ENABLED` everything is allowed (self-host). Never gate data export or account deletion. Data intake (any new
  source, import or push route) calls `intakeBlocked()` (lib/legal/intake.ts: Art. 9 consent + plan).
- A new user table is exported and deleted automatically (lib/account/data.ts reads the schema); mark secret columns
  in `SECRET_COLUMNS`.
- Onboarding (Phase 5): `lib/onboarding/` (pure flow + server checks), `/onboarding`; the dashboard layout redirects
  new accounts. Demo: `lib/demo/` (generator, read-only serving), `/demo/*` only with `DEMO_MODE=1`. A read-only scope
  (`runAsUser(…, { readOnly: true })`) makes the DB refuse every write and stays read-only for nested scopes; a new
  GET route the dashboard reads must be added to `lib/demo/routes.ts` or excluded in `tests/demo/serve.test.ts`.
- Legal pages are templates: operator details only as `<Ph>…</Ph>` (`[PLATZHALTER: …]`), never invented.
- Every change on its own branch (`feature/…`, `fix/…`, `chore/…`) with a pull request to `main`.
