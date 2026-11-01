# Phase 2 · Multi-user — plan

Branch `phase-2-multi-user` (from `main`). Approved by Livius; executed autonomously. Pre-release: there is no production
database yet, so schema changes need no data migration (one clean baseline migration).

## Objective

Runmate serves several people from one deployment without any of them seeing another's data, plan, zones or time zone:

- **2a · Data scoped per user:** every user-owned row carries the Clerk user id; every query goes through one helper;
  the secret calendar/Apple Health links resolve to a user; the daily cron syncs every user who has Garmin set up;
  Garmin credentials and tokens are per user and encrypted at rest; schema changes ship as drizzle-kit migrations.
- **2b · Per-user context:** a `user_profile` row (HFmax, resting HR, optional LTHR, zone model, PB, VO2max, weight,
  easy pace, time zone, locale) replaces the constants in `lib/analytics/hr.ts`, `lib/athlete.ts` and the
  Europe/Berlin "today"; module-level state (block registry, rules, zones) becomes per request so two users served by
  the same process never see each other's blocks or zones.

## Approach for per-user context (decision)

One **scope** object per user: `{ userId, profile, live blocks, request cache }` (`lib/scope.ts`, isomorphic).
Everything that used to read a module constant (`blocks()`, `rulesFor()`, `hrZones()`, `todayLocal()`, `athlete()`)
reads `currentScope()` instead, so the ~40 call sites keep their synchronous signatures.

- **Server:** `currentScope()` resolves through an `AsyncLocalStorage` installed by `lib/server/scope.ts`. Each route
  handler is wrapped (`withUser`), which reads the Clerk user, loads the profile and runs the handler inside
  `als.run(scope)`. The dashboard layout, the cron job and the token routes enter a scope the same way
  (`runAsUser(userId, fn)`). Outside a scope the server only sees the code-level defaults (plan files, default profile);
  writing per-user state there throws.
- **Browser:** one user per tab, so the dashboard layout hands the scope (profile + live blocks) to a client provider
  (`components/UserScope.tsx`) that installs it as the browser's scope before the page renders. Client-component SSR
  has no user scope, so the provider renders the page body only after hydration (pages are client components that
  fetch their data anyway).
- Rejected: explicit parameters through every pure function (touches ~40 files and every test for no extra safety);
  React context only (pure helpers cannot read it); a global registry with a lock (unsafe across awaits).

## Acceptance criteria

- **AC-1 (scoped data):** Given two users with data in every table, when either calls any API route, then only rows
  with their `user_id` are read or written. A test fails the build for any `db.select/update/delete` on a user table
  without the owner filter or an `insert` without `userId`, unless the line is explicitly marked as cross-user.
- **AC-2 (auth):** Given no Clerk session, when a user-scoped route is called, then it answers 401 and touches no data.
- **AC-3 (secret links):** Given user A's calendar or Apple Health token, when the public route is called with it,
  then A's plan is served / A's data is stored; an unknown token answers 404; rotating issues a new token for that
  user only.
- **AC-4 (cron):** Given users with Garmin credentials, when the daily cron runs, then each is synced in its own scope,
  in small batches, and one user's failure is reported without stopping the others.
- **AC-5 (Garmin secrets):** Given a user saves Garmin credentials, then username, password and tokens are stored
  AES-256-GCM-encrypted with `ENCRYPTION_KEY`, are never logged and never returned by an API; there is no
  process-global Garmin client.
- **AC-6 (profile):** Given a profile with HFmax/rest/LTHR/zone model/time zone, then zones, race HR caps, TRIMP,
  athlete facts and "today" (incl. ICS and Apple Health) derive from it; given no profile, the app renders with
  defaults that are marked as such, and the settings page can edit the profile.
- **AC-7 (isolation):** Given two users with different HFmax and different blocks whose requests interleave in one
  process, then each sees only their own zones, blocks and today — proven by a test.
- **AC-8 (no regression):** Given the Porto example and the example profile (the old defaults), when
  `scripts/snapshot-plan.mts` runs, then its output is byte-identical to `main`; `tsc`, `vitest` and `next build`
  (without database env) pass.
- **AC-9 (migrations):** Given an empty database, when `npm run db:migrate` runs, then the drizzle-kit baseline
  creates the schema; the README documents it; `scripts/migrate-schema.mjs` is gone.

## Tasks

1. Scope core: `lib/scope.ts`, `lib/server/scope.ts` (ALS, `runAsUser`, `getUserId`, `withUser`), profile model
   (`lib/profile.ts`) with derived zones; `hr.ts`, `athlete.ts`, `dates.ts`, `blocks.ts`, `live-blocks.ts` read the
   scope. Isolation test.
2. Schema: `user_id` + composite keys + indexes; drop unused Strava-era tables; `user_profile`, `garmin_accounts`,
   `link_tokens`. drizzle-kit baseline migration; remove `migrate-schema.mjs`.
3. Scoped data access: `lib/db/owned.ts` (`own()`, `uid()`), `lib/db/settings.ts`; every store and route through it;
   static scoping check test.
4. Garmin per user: encrypted credentials/tokens (`lib/crypto.ts`), no global client, credentials API + settings form.
5. Secret links (token → user) and cron over users in batches.
6. Profile API + settings form; time zone everywhere (ICS, HealthCard, connections).
7. Docs (README, CLAUDE.md, .env.example), verification, SUMMARY.md.

## Boundaries

- No `ActivitySource` adapter (Phase 3); Garmin stays the only source, just per user.
- No i18n extraction (locale is stored and defaulted only); no billing, no orgs.
- Plan logic stays pure; Porto output unchanged; no new npm packages.
- Never push, never add a remote; `/Users/liviusdegraaf/dashboard` untouched.
