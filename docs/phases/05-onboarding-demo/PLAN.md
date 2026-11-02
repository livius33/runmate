# Phase 5 · Onboarding + demo — plan

Branch `phase-5-onboarding-demo` (from `main`, local only). Builds on Phase 2 (scope, `withUser` / `runAsUser`,
`own` / `mine`), Phase 3 (sources, Settings cards) and Phase 4 (entitlements, trial, Art. 9 consent, deletion).
Phase 6 (landing page) runs in parallel and owns `app/(marketing)/`, the move of the dashboard home to `/plan`,
`middleware.ts`, `app/layout.tsx` and the dark tokens in `globals.css`; this phase does not edit them.

## Objective

1. **Onboarding** — a new user's first sign-in leads through a short German flow: Art. 9 consent (hosted only),
   profile (HFmax/resting HR with "weiß ich nicht", PB or recent race, weight optional, time zone from the browser),
   a data source (Garmin login, Apple Health link, file import — the Settings cards) or skip, then a goal race and a
   method → first draft from the existing generator → review → go live; or "erstmal ohne Ziel" → a base block.
   Progress is saved per step, the flow resumes where it stopped, skippable steps say so, existing users never see it.
   With billing on, the trial starts on the first page of the flow.
2. **Demo** — a deterministic synthetic athlete ("Hamburg HM", 12-week block) from a pure generator, seeded by a
   script and reset nightly, served read-only without login under `/demo/*` when `DEMO_MODE=1`. The demo can never
   read or write a real user's data. The same seed gives the landing-page screenshots.
3. **Billing follow-ups (approved)** — (a) buying during the trial ends the trial: kept, documented; (b) expired
   accounts are deleted after 12 months without activity, with a reminder 30 days before (pure `dueForDeletion()`,
   cron route, `notice_sent_at`; email sending is a TODO behind an interface, and without a mailer nothing is ever
   deleted); (c) a `deleted_users` tombstone so a late Paddle webhook cannot recreate a subscription row.

## Design

### Onboarding (`lib/onboarding/`, `app/onboarding/`)

- **State** (settings `onboarding`): `{ v: 1, step, done: Step[], skipped: Step[], goal: 'race' | 'base' | null,
  startedAt, completedAt }`. Steps in order: `consent` (only when `healthConsentRequired()`), `profile`, `source`,
  `goal`. Pure state machine `lib/onboarding/flow.ts`: `stepsFor({ consentRequired })`, `next(state, event)` with
  events `complete(step)`, `skip(step)` (only `source` and `goal` are skippable; `consent` cannot be completed without
  a granted consent, `profile` cannot be skipped but every field may stay empty), `back`, and `finish`;
  `currentStep(state)` = first step neither done nor skipped; `isComplete`.
- **Who sees it** (`needsOnboarding()`): no `onboarding` row and no trace of use (no `user_profile` row, no activity,
  no live block, no `athlete_profile`) → new user. A user with any trace and no row is an existing user: never
  redirected (nothing is written on read). A row with `completedAt` → done.
- **Routes:** `GET /api/onboarding` → `{ state, steps, current, consent, profile, sources }`; `POST /api/onboarding`
  `{ event: 'complete' | 'skip' | 'back' | 'finish', step }` → next state (server checks the step's precondition:
  consent granted, profile saved). The page reuses `/api/consent/health`, `/api/profile`, `/api/sources/*`,
  `/api/import`, `/api/health-link`, `/api/season`, `/api/running/drafts`, `/api/running/base-block`.
- **Page** `app/onboarding/page.tsx` (own layout: scope, entitlements, `ensureSubscription()` = trial start; Clerk
  still protects it via the middleware). The dashboard layout redirects to `/onboarding` while `needsOnboarding()`.
- **Profile step:** HFmax, resting HR, PB (race + time), weight, time zone (browser `Intl` default, editable).
  "Weiß ich nicht" for HFmax asks the age and stores **208 − 0,7 × Alter** (Tanaka et al. 2001) with a note that
  the estimate can be ±10 Schläge off; research note added to `methodologies/research/paces.md`. Resting HR unknown
  → left empty (the profile marks it as Beispielwert).
- **Goal step:** race name, date, distance (half / marathon / 10 km), goal time → `PUT /api/season` (priority A);
  current weekly km when there are no runs yet (draft override); method from the fitting templates; preview
  (`POST /api/running/drafts`) shows weeks with km and the key sessions; "Plan übernehmen" saves the draft and goes
  live (start = next Monday). "Erstmal ohne Ziel" turns on a goal-less base block from next Monday
  (`BaseSettings.start`, see below).
- **Goal-less base block:** `baseGaps()` gains an optional standalone start: when `settings.start` is set and no goal
  block covers that time, a base gap runs from that Monday to the horizon (or the next goal block), with a neutral
  placeholder race. Without the setting nothing changes (snapshot stays identical). No runs yet → the profile's weekly
  km is the starting level instead of the 30 km floor.

### Demo (`lib/demo/`, `scripts/seed-demo.mts`, `app/demo/`)

- **Generator** `lib/demo/generate.ts` (pure apart from registering the block in the caller's scope):
  `generateDemo(today) → DemoData { profile, settings: Record<key, json>, activities[], streams[] }`. Fixed seed
  (mulberry32). The block is generated by the real generator (`generateDraft` + `freezeDraft`, a half template) for
  a fictional runner (no real person: invented name-free profile, Hamburg Alster loop as a geometric track) and placed
  so that `today` is in week 9 of 12. Eight weeks of history before it; then day by day like the simulator: the
  engine runs every morning on what is "synced" (yesterday), the athlete runs the effective session (km, pace, HR
  with small seeded noise; streams with GPS, HR, cadence, altitude; metrics via `computeRunMetrics`). Scripted
  events: week 3 key session missed, week 5 Krank (4 days) with the graded return, week 7 too much too soon → the
  fatigue guard (ACWR/TSB red zone), strength and bike sessions, run feedback (RPE, Gefühl, a note), one week rating.
- **Isolation and read-only:** `DEMO_USER_ID = 'demo-hamburg-hm'` (not a Clerk id format). `runAsDemo(fn)` enters a
  scope with that id and `readOnly: true`. The DB proxy (`lib/db/index.ts`) refuses `insert` / `update` / `delete` /
  `execute` in a read-only scope (`DemoReadOnlyError`, German "Demo – nur ansehen"). Demo entitlements = everything
  (no upsells), billing never read.
- **Routes:** `app/demo/layout.tsx` (404 unless `DEMO_MODE=1`; banner "Demo – nur ansehen · fiktive Läuferin";
  no Clerk), `app/demo/[[...path]]/page.tsx` renders the dashboard page components; `app/demo/api/[...path]/route.ts`
  dispatches GETs to an allowlist of the real route modules inside `runAsDemo` and answers every other method 403.
  In the demo tab a small bridge rewrites `fetch('/api/…')` → `/demo/api/…` and in-app links → `/demo/…`.
  **Phase 6 must make `/demo(.*)` public in `middleware.ts`.**
- **Seed and reset:** `scripts/seed-demo.mts` (deletes the demo user's rows, writes `generateDemo(today)`; refuses
  any other user id); `GET /api/cron/demo-reset` (CRON_SECRET, only with `DEMO_MODE=1`) does the same nightly;
  documented in README with the `vercel.json` cron line for the demo deployment.

### Billing follow-ups (`lib/billing/retention.ts`, `lib/account/`)

- Schema (migration `0003_onboarding_demo_retention`): `subscription.last_seen_at`, `subscription.notice_sent_at`;
  table `deleted_users (user_id PK, deleted_at)`.
- `last_seen_at`: the dashboard layout stamps it at most once a day (billing on only).
- Pure `dueForDeletion(row, nowS)` → `'keep' | 'notice' | 'delete'`: only `expired` accounts; inactive since
  `max(last_seen_at, expiry)`; notice from 12 months − 30 days; delete at 12 months **and** a notice sent ≥ 30 days
  ago **and** no activity after it. Activity after the notice resets it.
- `GET /api/cron/expired-accounts` (CRON_SECRET, billing on): lists subscription rows (cross-user), sends notices via
  `RetentionMailer` (interface; default = none configured → notices are not sent and not stamped, so no account is
  ever deleted), deletes due accounts with `deleteAccount({ deleteClerkUser: true, strictBilling: false })`.
- Tombstone: `deleteAccount()` writes `deleted_users` after deleting the rows; `handlePaddleEvent()` returns
  `'deleted-user'` and writes nothing (not even `billing_events`) for a tombstoned user.

## Acceptance criteria

- **AC-1 flow:** Given the step list with/without consent, when events are applied, then `currentStep` follows the
  order, only `source`/`goal` can be skipped, `back` never leaves the first step, `finish` needs every step done or
  skipped, and replaying the saved state resumes at the same step (property test).
- **AC-2 who sees it:** Given a user with no row and no trace, then `needsOnboarding()` is true and the dashboard
  layout redirects; given any trace (profile, activity, live block, athlete profile) or `completedAt`, then false
  and no write happens.
- **AC-3 server checks:** Given consent required and not granted, when `complete(consent)` is posted, then 400 and
  the state is unchanged; `complete(profile)` without a saved profile → 400; `skip(profile)` → 400.
- **AC-4 HFmax estimate:** Given age 40, then 180 is stored and the note is shown; invalid ages are refused.
- **AC-5 first plan / base:** Given a goal and a template, then the onboarding's choice produces the same draft as
  `/plan/neu` (same generator call) and going live registers the block; given "ohne Ziel", then a base block starts
  next Monday with the profile's weekly km; without the setting `baseBlocks()` is unchanged.
- **AC-6 demo determinism:** Given the same `today`, `generateDemo` returns byte-identical data; for 7 consecutive
  `today`s the data contains a missed key session (engine log `missed-key`), a Krank pause with return caps, an
  active `fatigue` change, ≥ 3 cross-training rows, a week rating, run feedback; no real personal data (no
  email, no Clerk id, fixed demo id on every row).
- **AC-7 demo isolation:** Given `DEMO_MODE=1` and a signed-in real user, when `/demo/api/…` is requested, then
  every SQL query carries only the demo user id; Clerk is never asked; without `DEMO_MODE` → 404 and no query.
- **AC-8 demo read-only:** every non-GET → 403 "Demo – nur ansehen" with no query; a GET handler that tries to write
  → 403, no write reaches the driver; routes off the allowlist (export, billing, account, sources writes) → 404.
- **AC-9 seed/reset:** the seed deletes and writes only demo rows; the reset route needs CRON_SECRET and DEMO_MODE.
- **AC-10 retention:** `dueForDeletion` table tests (active/trial/paid → keep; expired 11 months → notice; 12 months
  with notice ≥ 30 days → delete; activity after notice → keep; no notice → never delete); the cron without a mailer
  deletes nothing.
- **AC-11 tombstone:** after `deleteAccount` a tombstone is written; a later Paddle event for that user writes
  nothing (no subscription, no billing_events row).
- **AC-12 no regression:** tsc clean; vitest green; `next build` with an empty environment; plan snapshot
  byte-identical to `main`.

## Tasks

1. Plan (this file).
2. Billing follow-ups: schema + migration, retention, cron, tombstone, tests.
3. Onboarding: flow, store, API, page, base-block standalone start, HFmax estimate + research note, tests.
4. Demo: read-only scope + DB guard, generator, seed script, reset cron, `/demo` layout/pages/API, tests.
5. Docs (README, CLAUDE.md, .env.example), verification, SUMMARY.md.

## Boundaries

- Do not edit `app/(marketing)/`, `middleware.ts`, `app/layout.tsx`, `globals.css` dark tokens (Phase 6).
- No new dependencies. No changes to the engine, generator or plan outputs (snapshot identical).
- No email sending (interface only). No real personal data in the demo.
