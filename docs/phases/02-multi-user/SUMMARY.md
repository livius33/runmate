# Phase 2 · Multi-user — summary

Branch `phase-2-multi-user` (from `main`, not pushed). Plan: [PLAN.md](PLAN.md).

Commits: `933abe9` plan · `af11191` per-user scope and user-scoped data · `7d725f1` drizzle-kit baseline + docs ·
`ea9a0ed` tests.

## What shipped

**Per-user context (2b).** One scope per request (`lib/scope.ts`): user id, resolved profile, live blocks and a
request cache. On the server an `AsyncLocalStorage` store (`lib/server/scope.ts`) entered by `withUser` (every user
route) and `runAsUser` (dashboard layout, cron, secret-link routes, scripts). In the browser the dashboard layout hands
profile and live blocks to `components/UserScope.tsx`, which installs them as the tab's scope. Everything that was
module state now reads the scope, with unchanged synchronous call sites:

- block registry (`blocks()`, `activeBlock()`, `rulesFor()`, …): plan files stay global (code), live blocks per scope;
- HR model: `hrZones()`, `hrMax()`, `hrRest()`, `raceHr()` from the profile (`lib/analytics/hr.ts`), zone models
  `hrmax` (the shares Runmate always used) and `lthr` (Friel's shares of LTHR; falls back to `hrmax` without an LTHR);
- athlete facts: `athlete()` (PB, VO2max, zone 2, easy pace, race cap, weight) from the profile (`lib/athlete.ts`);
- "today": `todayLocal()` / `localDate()` in the profile's time zone (replaces `todayInHamburg`/`hamburgDate`),
  also the ICS `X-WR-TIMEZONE`, the Apple Health card and the onboarding's "Verbindungen" step.

Module-level captures (`const Z2 = HR_ZONES[1]`, the carb `kg` string, `Z2_MID`) became functions. The profile is a
`user_profile` row; missing fields resolve to the old example defaults and are listed in `profile.defaults`, which the
new **Mein Profil** card in Settings marks as "Beispielwert". `GET/PUT /api/profile` validates (German errors).

**Data scoped per user (2a).**

- Schema: `user_id text not null` on all 9 tables; composite primary keys `(user_id, …)` for settings, activities,
  activity_streams (with a composite FK to activities), health_days, health_workouts; one row per user for
  training_plan, user_profile, garmin_accounts; `unique(user_id, garmin_activity_id)`; indexes on `(user_id, date)` for
  activities and health_workouts (the PKs lead with `user_id`). The unused Strava-era tables (`strava_tokens`,
  `athlete`, `gear`, `heart_rate_zones`, `athlete_stats`, `api_cache`) and the Strava settings route are gone.
  New: `user_profile`, `link_tokens`, `garmin_accounts`.
- Access: `lib/db/owned.ts` (`own(table, …conditions)`, `mine(values)`, `uid()` → 401 outside a scope) and
  `lib/db/settings.ts` (the only reader/writer of the key/value store). All stores, routes and the backfill script go
  through them; every user route is wrapped in `withUser`.
- Secret links: `link_tokens(token PK, user_id, kind)`, one per user and kind (`lib/links/tokens.ts`); the calendar
  feed and the Apple Health upload resolve token → user, then run as that user. Malformed tokens never reach the DB.
- Cron: `/api/cron/daily-sync` lists users with a Garmin account (least recently synced first), syncs them in batches
  of 3 with `Promise.allSettled`, each in its own scope, stops starting batches after 45 s and reports
  `{ users, synced, failed, skipped }`.
- Garmin: per-user credentials and session in `garmin_accounts`, AES-256-GCM with `ENCRYPTION_KEY` (`lib/crypto.ts`,
  `v1.<iv>.<tag>.<ct>`); a settings form (`PUT/DELETE /api/garmin/account`); status returns only booleans and
  timestamps; login errors are replaced by a neutral message. The process-global client is gone: one client per
  request scope. `GARMIN_USERNAME`/`GARMIN_PASSWORD` are no longer read.
- Migrations: drizzle-kit, one baseline `drizzle/0000_baseline.sql`; `npm run db:generate` / `npm run db:migrate`
  (README "Database migrations"; `drizzle.config.ts` reads `.env.local`); `scripts/migrate-schema.mjs` and
  `scripts/backfill-enrich.mjs` removed; `scripts/backfill-run-metrics.mts` runs per user (`--user` optional).

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC-1 scoped data | ✅ | `tests/db/scoping.test.ts` (every table has `user_id`; static check over app/, lib/, scripts/ finds no unfiltered query; scanner self-test); `tests/scope/queries.test.ts` (SQL carries `"user_id" = $1` with the right user) |
| AC-2 auth | ✅ | `tests/scope/routes.test.ts`: no session → 401, handler not run; `uid()` outside a scope throws before any query |
| AC-3 secret links | ✅ | `tests/scope/queries.test.ts`: token → owner, unknown → null, malformed → no query, rotate upserts on `(user_id, kind)` |
| AC-4 cron | ✅ | `tests/scope/routes.test.ts`: 5 users, each synced in their own scope with their own profile; one failure → `synced 4, failed 1` |
| AC-5 Garmin secrets | ✅ | `tests/scope/crypto.test.ts` (round trip, fresh IV, tamper/wrong key rejected, key parsing); `queries.test.ts` (no plaintext in the INSERT parameters, status without values) |
| AC-6 profile | ✅ | `tests/scope/profile.test.ts` (defaults = old constants and marked; HFmax/LTHR → zones, race caps, athlete facts; time zone; form validation); Settings → Mein Profil |
| AC-7 isolation | ✅ | `tests/scope/isolation.test.ts`: 60 interleaved requests of two users (HFmax 200 vs 170, different blocks and engine rules, time zones UTC+14 vs UTC−11) through the real `ensureLiveBlocks`; process scope untouched; writing user state outside a scope on the Next server throws. Mutation check: bypassing the ALS resolver makes all three tests fail |
| AC-8 no regression | ✅ | `scripts/snapshot-plan.mts` (as `examples/porto-2026/profile.ts`) byte-identical to `main` (7,662,683 bytes); tsc clean; vitest green; `next build` without `DATABASE_URL` succeeds |
| AC-9 migrations | ✅ (generation) | baseline generated and committed, README documents it; not run against a live database (none exists yet) |

Tests: `main` 38 files / 330 passed + 1 todo → now 44 files / 360 passed + 1 todo (30 new).

## Decisions

- **Scope via AsyncLocalStorage + browser process scope** instead of explicit parameters: keeps ~40 synchronous call
  sites and every plan test unchanged; the isolation test proves no leakage. Rule (CLAUDE.md): never per-user state in
  module variables; call `hrZones()`/`athlete()`/`todayLocal()` inside functions.
- **Page bodies of the dashboard render only in the browser** (`<ScopeReady>` in the layout, and the header date):
  client-component SSR runs in a process shared by all users and has no user scope. The pages already fetch their data
  client-side, so SSR mostly showed loading states; the shell (sidebar, header) still renders on the server.
- **Snapshot profile = HFmax 190 / rest 60 / Europe/Berlin**: the values `main`'s `hr.ts` actually had (its example
  defaults). HFmax 200 / rest 65 are the private dashboard's values and would not give a meaningful comparison against
  `main`. They are also the default profile, so an install without a profile behaves as before.
- **Race HR caps stay shares of HFmax** in both zone models (research paces.md §2.1); only the zones follow LTHR.
- **Link tokens stored in plain text** (the settings page shows the link again); lookup by primary key.
- **Strava-era tables dropped** (no code used them; pre-release, no data).

## Deferred

- Phase 3: the `ActivitySource` adapter; logging in with the user's own Garmin credentials becomes one source among
  several (`lib/garmin/account.ts` is the seam). `garmin-connect` remains unmaintained.
- Cron scale: one 60 s invocation covers a few dozen users; beyond that a queue (e.g. Vercel Queues) or per-user fan-out.
- i18n: `locale` is stored and defaulted (`de`) but not used; texts stay German.
- Per-user data export and account deletion (GDPR); a Clerk webhook to delete a user's rows.
- ICS event UIDs are `<date>@runmate.dev` for every user (fine per feed; not unique if one client subscribes to two feeds).
- The scoping check is text-based: it sees `db.…` chains, not queries built through another variable.

## For Livius to decide

1. **LTHR zone model:** Friel's shares (85/90/95/100 % LTHR) without a note in `methodologies/research/` yet — keep,
   research first, or hide the option until then?
2. **ENCRYPTION_KEY rotation:** single key now (values carry a `v1.` prefix, so a second key can be added later);
   rotating today means users re-enter their Garmin login.
3. **Link tokens:** plain text (link can be shown again) vs. hashed (shown once, like an API key).
4. **SSR trade-off:** OK as is, or should a later phase pass the scope explicitly so page bodies render on the server?
