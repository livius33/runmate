# Runmate

An adaptive marathon and half-marathon training plan that reads your real runs and adjusts itself, built on published
training methods.

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

## Self-host quick start (Neon + Clerk + Vercel)

Requirements: Node.js 22, a [Neon](https://neon.tech) Postgres database, a [Clerk](https://clerk.com) application.

```bash
git clone <your fork> runmate && cd runmate
npm ci
cp .env.example .env.local        # fill in the values (table below)
npm run db:migrate                # applies drizzle/*.sql to DATABASE_URL (only the ones not applied yet)
npm run dev                       # http://localhost:3001
```

1. **Neon:** create a project (EU region recommended, e.g. `aws-eu-central-1`) and copy the pooled connection string
   into `DATABASE_URL`.
2. **Clerk:** create an application, copy the publishable and secret keys. To restrict sign-in with `ALLOWED_EMAILS`,
   add the email to the session token: Clerk Dashboard → Sessions → Customize session token →
   `{ "email": "{{user.primary_email_address}}" }`. Sessions without that claim are rejected while an allowlist is set.
3. **Vercel:** import the repository, add the same environment variables, deploy. `vercel.json` schedules the daily
   Garmin sync (`/api/cron/daily-sync`, 06:00 UTC); Vercel sends `CRON_SECRET` with it.
4. Sign in, open **Settings**: fill in **Mein Profil** (HFmax, resting HR, time zone, …), then under **Datenquellen**
   connect Garmin and/or import files (FIT/GPX/TCX or the Garmin data-export ZIP).
5. Open **Saison**, add a goal race and create its plan (**Plan erstellen**).

### Database migrations

The schema lives in [`lib/db/schema.ts`](lib/db/schema.ts); migrations are generated SQL in [`drizzle/`](drizzle/)
(`0000_baseline.sql` is the whole schema). After changing the schema:

```bash
npm run db:generate -- --name <what-changed>   # writes drizzle/NNNN_<what-changed>.sql — review and commit it
npm run db:migrate                             # applies it (drizzle.config.ts reads DATABASE_URL from .env.local)
```

Every table has a `user_id` (the Clerk user id); queries go through `lib/db/owned.ts`, and `npm test` fails on a query
of a user table without the owner filter.

A Dockerfile is included for other hosts (untested in this pre-release; Docker Compose docs follow).

The repository ships an example training block (a real 3:05 Porto Marathon build) in
[`examples/porto-2026/`](examples/porto-2026/). The app does not load it unless you register it.

### Environment variables

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon/Postgres connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | yes | Clerk secret key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | recommended | `/sign-in` |
| `ALLOWED_EMAILS` | no | Comma-separated emails allowed to sign in; empty = any signed-in Clerk user |
| `ENCRYPTION_KEY` | for Garmin | 32 random bytes (`openssl rand -base64 32`); encrypts each user's Garmin login and session at rest (AES-256-GCM). Changing it makes stored logins unreadable: users enter them again |
| `CRON_SECRET` | for the cron | Secret the daily sync route checks (Vercel Cron sends it) |
| `APP_HOST` | no | Public host for calendar and Health links (e.g. `www.example.com`); default: the request host |
| `CLERK_WEBHOOK_SECRET` | recommended | Signing secret of the Clerk webhook endpoint `/api/webhooks/clerk` (event `user.deleted` deletes the user's data) |
| `BILLING_ENABLED` | hosted only | `1` turns on subscriptions, the 30-day trial and the Art. 9 consent prompt. Unset = self-host: every feature, no billing |
| `REQUIRE_HEALTH_CONSENT` | no | `1` asks for the health-data consent without billing (a self-hosted instance serving other people) |
| `PADDLE_ENV` | with billing | `sandbox` or `production` |
| `PADDLE_API_KEY` | with billing | Paddle API key (cancel, customer portal); server only |
| `PADDLE_WEBHOOK_SECRET` | with billing | Secret of the Paddle notification destination `/api/billing/webhook` |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | with billing | Paddle.js client-side token (checkout) |
| `PADDLE_PRICE_BASIC_MONTH`, `PADDLE_PRICE_BASIC_YEAR`, `PADDLE_PRICE_PLUS_MONTH`, `PADDLE_PRICE_PLUS_YEAR` | with billing | Paddle price ids (`pri_…`) per plan and interval |

### Your values

Each user keeps their own profile (**Settings → Mein Profil**): HFmax, resting HR, optional LTHR and zone model
(shares of HFmax, or Friel's shares of LTHR), marathon PB, VO2max, weight, easy pace, time zone. Zones, race HR caps,
TRIMP load, carb amounts and "today" derive from it. Empty fields use **example defaults** (HFmax 190, resting HR 60,
Europe/Berlin, …), marked as such in the form.

### Billing (hosted only)

Self-hosting needs none of this: without `BILLING_ENABLED` every feature is on and no subscription is stored. The
hosted app sells **Basic** (sync, analysis, insights, one generated plan; the engine's changes are suggestions) and
**Plus** (the engine adapts the plan by itself, several plans, own method, race-day tools) through
[Paddle](https://www.paddle.com) as merchant of record, after a 30-day trial without a card. What each plan state may
do is one pure module, [`lib/billing/entitlements.ts`](lib/billing/entitlements.ts); data export and account
deletion are never gated.

Setup: create the four prices in Paddle, a client-side token, an API key and a notification destination
`https://<host>/api/billing/webhook` for `subscription.*` and `transaction.completed`; fill the `PADDLE_*` variables.
For Clerk add a webhook endpoint `https://<host>/api/webhooks/clerk` for `user.deleted`. The legal page templates
(`/impressum`, `/datenschutz`, `/agb`, `/kuendigen`) contain `[PLATZHALTER: …]` that must be filled and reviewed
before going live.

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
