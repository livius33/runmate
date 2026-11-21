<div align="center">

<img src="app/icon.svg" width="72" height="72" alt="">

# Runmate

**An adaptive marathon and half-marathon training plan that reads your real runs and adjusts itself,<br>built on published training methods.**

[![CI](https://github.com/livius33/runmate/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/livius33/runmate/actions/workflows/ci.yml)
[![Licence: AGPL v3](https://img.shields.io/badge/licence-AGPL--3.0-E5484D.svg)](LICENSE)
[![Self-host: Docker Compose](https://img.shields.io/badge/self--host-Docker%20Compose-2496ED.svg)](docs/SELF-HOST.md)

[Features](#features) · [Screenshots](#screenshots) · [Self-host](#self-host) · [Demo](#demo) · [Data sources](#data-sources) · [Contributing](CONTRIBUTING.md)

<img src="docs/screenshots/overview.webp" width="880" alt="Runmate overview: today's session with paces and heart-rate range, the week's plan and race readiness for a half marathon">

</div>

> **Status: pre-release.** Runmate grew out of one runner's private dashboard and is being opened up. One install
> serves several users, each with their own data, plan, profile and data sources (Garmin login, Apple Health, file
> import); official data-source APIs and a hosted version are in progress (see [docs/LAUNCH-PLAN.md](docs/LAUNCH-PLAN.md)). The interface is German for now.

## Features

- **Plans from methods, not from scratch.** Generate a block for a goal race from methodology templates (Daniels,
  Pfitzinger, Hansons, Lydiard, Norwegian threshold, polarized 80/20) or your own method, with the reasons for every
  number. Templates are plain Markdown + YAML in [`methodologies/`](methodologies/); the research behind the rules is in
  [`methodologies/research/`](methodologies/research/).
- **Adaptive engine.** Missed key sessions move, missed kilometres are rebalanced within safe caps, a fatigue guard
  softens sessions when TSB or ACWR enter the red zone, and every change is explained and can be undone.
- **Real-life planning.** Sick/pause periods with a graded return, minor races inside a block (test, build or just for
  fun), a rolling base block between goal races, a season timeline.
- **Run analysis.** Activities from Garmin, Apple Health or imported files with aligned streams (pace, HR, elevation, cadence), splits, HR zones, map,
  comparison with similar runs, per-run insights and feedback (RPE, feel, pain).
- **Fitness & load.** CTL/ATL/TSB (TRIMP), ACWR, cross-training load by session-RPE, progress per block.
- **Race week and race day.** Race-week checklist, carb amounts, pacing plan A/B with checkpoints and gel timing,
  post-race analysis against the plan.
- **Calendar and Apple Health.** A private ICS feed of the plan; an iOS Shortcut can post daily Health data (sleep,
  resting HR, HRV, weight, other workouts) to a private link.

## Screenshots

The demo runner, eight weeks into a half-marathon block (invented data, see [Demo](#demo)).

| Analysis | A single run |
|:---:|:---:|
| <img src="docs/screenshots/analysis.webp" alt="Analysis: block progress against the plan, long-run build, pace in zone 2, race-pace blocks"> | <img src="docs/screenshots/run.webp" alt="A run: pace, heart rate and elevation over the distance, the route coloured by pace, kilometre splits and time in heart-rate zones"> |
| **Race day** | **All runs** |
| <img src="docs/screenshots/race-day.webp" alt="Race day: plan A and B, pacing by section, split times with clock times, gel timing"> | <img src="docs/screenshots/runs.webp" alt="Runs: list of activities with type, distance, pace, heart rate, cadence and efficiency"> |

## Self-host

Full guide: **[docs/SELF-HOST.md](docs/SELF-HOST.md)** (Docker Compose with Postgres, or Neon + Vercel; Clerk for
sign-in in both).

```bash
git clone https://github.com/livius33/runmate.git && cd runmate
cp .env.example .env              # Clerk keys, POSTGRES_PASSWORD, ENCRYPTION_KEY, CRON_SECRET
docker compose up -d --build      # Postgres + migrations + app on http://localhost:3000 + daily sync
```

Then sign in and follow the onboarding: profile (HFmax, resting HR, time zone, …), a data source (Garmin login or file
import), and a goal race with its first plan.

### Database migrations

The schema lives in [`lib/db/schema.ts`](lib/db/schema.ts); migrations are generated SQL in [`drizzle/`](drizzle/)
(`0000_baseline.sql` is the whole schema). After changing the schema:

```bash
npm run db:generate -- --name <what-changed>   # writes drizzle/NNNN_<what-changed>.sql — review and commit it
npm run db:migrate                             # applies it (drizzle.config.ts reads DATABASE_URL from .env.local)
```

Every table has a `user_id` (the Clerk user id); queries go through `lib/db/owned.ts`, and `npm test` fails on a query
of a user table without the owner filter.

The repository ships an example training block (a real 3:05 Porto Marathon build) in
[`examples/porto-2026/`](examples/porto-2026/). The app does not load it unless you register it.

### Environment variables

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes (not with Compose) | Neon/Postgres connection string; Docker Compose builds it from `POSTGRES_PASSWORD` |
| `POSTGRES_PASSWORD` | Compose only | Password of the Compose Postgres (letters and digits) |
| `DATABASE_DRIVER` | no | `neon` or `pg` to override the driver guess (`*.neon.tech` → Neon HTTP, else node-postgres) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | yes | Clerk secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | recommended | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | recommended | `/sign-up` (open only with `BILLING_ENABLED`, otherwise it leads to the waitlist) |
| `ALLOWED_EMAILS` | no | Comma-separated emails allowed to sign in; empty = any signed-in Clerk user |
| `ENCRYPTION_KEY` | for Garmin | 32 random bytes (`openssl rand -base64 32`); encrypts each user's Garmin login and session at rest (AES-256-GCM). Changing it makes stored logins unreadable: users enter them again |
| `CRON_SECRET` | for the cron | Secret the daily sync route checks (Vercel Cron sends it) |
| `APP_HOST` | no | Public host for calendar and Health links (e.g. `www.example.com`); default: the request host |
| `CLERK_WEBHOOK_SECRET` | recommended | Signing secret of the Clerk webhook endpoint `/api/webhooks/clerk` (event `user.deleted` deletes the user's data) |
| `BILLING_ENABLED` | hosted only | `1` turns on Free + Plus, the 30-day Plus trial and the Art. 9 consent prompt. Unset = self-host: every feature, no billing |
| `REQUIRE_HEALTH_CONSENT` | no | `1` asks for the health-data consent without billing (a self-hosted instance serving other people) |
| `PADDLE_ENV` | with billing | `sandbox` or `production` |
| `PADDLE_API_KEY` | with billing | Paddle API key (cancel, customer portal); server only |
| `PADDLE_WEBHOOK_SECRET` | with billing | Secret of the Paddle notification destination `/api/billing/webhook` |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | with billing | Paddle.js client-side token (checkout) |
| `PADDLE_PRICE_PLUS_MONTH`, `PADDLE_PRICE_PLUS_YEAR` | with billing | Paddle price ids (`pri_…`) of Plus per interval |
| `DEMO_MODE` | demo deployment only | `1` serves the read-only demo athlete without login under `/demo` (see [Demo](#demo)); unset = `/demo` is a 404 |
| `NEXT_PUBLIC_SITE_URL` | no | Canonical origin of the landing page (sitemap, hreflang, OG, JSON-LD); default `https://runmate.dev` |
| `NEXT_PUBLIC_REPO_URL` | no | Public repository URL; shows the GitHub links on the landing page (hidden while unset) |
| `NEXT_PUBLIC_VERCEL_ANALYTICS` | no | `1` loads cookieless Vercel Web Analytics on the marketing pages (enable Web Analytics in the Vercel project) |

### Your values

Each user keeps their own profile (**Settings → Mein Profil**): HFmax, resting HR, optional LTHR and zone model
(shares of HFmax, or Friel's shares of LTHR), marathon PB, VO2max, weight, easy pace, time zone. Zones, race HR caps,
TRIMP load, carb amounts and "today" derive from it. Empty fields use **example defaults** (HFmax 190, resting HR 60,
Europe/Berlin, …), marked as such in the form.

### Billing (hosted only)

Self-hosting needs none of this: without `BILLING_ENABLED` every feature is on and no subscription is stored. The
hosted app has two states: **Free** (sync, analysis, insights, one live plan edited by hand; the engine's changes are
suggestions) and **Plus** for 9 €/month or 79 €/year (the engine adapts the plan by itself, whole-plan rebuild, several
plans, own method, race-day tools, sleep and HRV feeding the plan), sold through [Paddle](https://www.paddle.com) as
merchant of record. A new account gets 30 days of Plus without a card and then continues as Free. What each plan state
may do is one pure module, [`lib/billing/entitlements.ts`](lib/billing/entitlements.ts); data export and account
deletion are never gated.

Setup: create the two Plus prices (monthly, yearly) in Paddle, a client-side token, an API key and a notification destination
`https://<host>/api/billing/webhook` for `subscription.*` and `transaction.completed`; fill the `PADDLE_*` variables.
For Clerk add a webhook endpoint `https://<host>/api/webhooks/clerk` for `user.deleted`. The legal page templates
(`/impressum`, `/datenschutz`, `/agb`, `/kuendigen`) contain `[PLATZHALTER: …]` that must be filled and reviewed
before going live.

### Accounts: onboarding and retention

A new account's first sign-in opens **/onboarding**: the Art. 9 consent (hosted only), the profile (HFmax or "weiß
ich nicht" → estimated from the age, resting HR, best or recent race, weight, time zone, run days), a data source or
skip, then a goal race with a method and the first generated plan, or "Erstmal ohne Ziel" (a base block from next
Monday). Every step is saved, so the flow resumes; accounts in use before the onboarding existed never see it. With
billing on, the trial starts there.

Free accounts (billing on; trial over or Plus ended) are deleted after 12 months without a visit, with a reminder 30 days before
(`/api/cron/expired-accounts`, [`lib/billing/retention.ts`](lib/billing/retention.ts)). The reminder needs a mail
provider behind `RetentionMailer`, which is not wired yet: until it is, nothing is sent and **nothing is deleted**.
Add the cron to `vercel.json` once the mailer exists (`{ "path": "/api/cron/expired-accounts", "schedule": "30 3 * * *" }`).
A deleted account leaves a tombstone (`deleted_users`), so a late Paddle webhook cannot recreate a subscription row.

## Demo

A fictional runner 8 weeks into a 12-week "Hamburg HM" block, generated by the app's own generator and engine
([`lib/demo/`](lib/demo/)): a missed key session caught up, four days Krank with the graded return, the fatigue guard
after too much too soon, strength and bike sessions, run and week feedback. No real personal data. The same seed is
meant for the landing-page screenshots.

- Deploy a separate instance (its own database is safest) with `DEMO_MODE=1`, then seed it:
  `npx tsx --env-file=.env.local scripts/seed-demo.mts` (`--dry` generates without a database).
- `/demo`, `/demo/running`, `/demo/running/activities`, `/demo/season`, `/demo/race`, `/demo/plan/anpassen` show the
  dashboard pages without login. Every request runs as the demo user in a read-only scope; the database refuses every
  write there and the demo API answers writes with 403 "Demo – nur ansehen". Only an allowlist of read routes is
  reachable (`lib/demo/routes.ts`).
- Nightly reset (the block always shows week 9): add `{ "path": "/api/cron/demo-reset", "schedule": "0 4 * * *" }` to
  the demo deployment's `vercel.json` crons; the route needs `CRON_SECRET` and `DEMO_MODE=1`.

## Data sources

| Source | Self-host | Status |
|---|---|---|
| Garmin (login) | Unofficial `garmin-connect` login with each user's own credentials (Settings → Datenquellen, with consent; stored encrypted), flagged experimental. No MFA | Works today; the client is a fork of the unmaintained `garmin-connect` package in `lib/vendor/garmin-connect/` (never logs tokens), and Garmin can change its login any time |
| Garmin (official API) | Garmin Connect Developer Program (Personal key for your own data; Starter for a hosted app) | Placeholder (`lib/sources/garmin-api.ts`), not implemented |
| Apple Health | iOS Shortcut posting to your personal secret link (`/api/health/[token]`); running workouts count only without another run source | Works today |
| File import (FIT / GPX / TCX / Garmin export ZIP) | Account-free; the browser unpacks the export and uploads in batches (≤ 20 MB per file); duplicates (start ±2 min, distance ±3 %, any source) are skipped unless the new record is richer (streams/laps, more channels, HR), which then replaces the old one and keeps the runner's RPE and feedback | Works today |
| Strava | OAuth; 2026 API terms limit caching (7 days), AI use and showing data to others — an import trigger, not the source of record | Planned, after launch |
| Polar / COROS / Suunto / Wahoo | — | Later |

You are responsible for using each source within its terms. Every source implements one interface,
`ActivitySource` ([`lib/sources/types.ts`](lib/sources/types.ts)); adding one means implementing it and listing it in
[`lib/sources/registry.ts`](lib/sources/registry.ts).

## Disclaimer

Runmate is **not a medical device** and gives no medical advice. Plans, insights and predictions are training
suggestions derived from published methods and your data; they do not diagnose anything or promise any health or
performance outcome. Stop and see a doctor when something hurts or feels wrong.

## Licence

Copyright © 2026 Livius de Graaf and contributors.

Runmate is free software under the [GNU Affero General Public License v3.0](LICENSE): you may use, change and share it,
and if you run a modified version as a network service, you must offer its source to its users. "Runmate" is a
trademark of the project; the licence does not grant rights to the name or logo. Contributions need a CLA, see
[CONTRIBUTING.md](CONTRIBUTING.md).
