# Runmate

An adaptive marathon and half-marathon training plan that reads your real runs and adjusts itself, built on published
training methods.

> **Status: pre-release.** Runmate grew out of one runner's private dashboard and is being opened up. It works for a
> single self-hosted user today; multi-user support, official data-source APIs and a hosted version are in progress
> (see [docs/LAUNCH-PLAN.md](docs/LAUNCH-PLAN.md)). The interface is German for now.

## Features

- **Plans from methods, not from scratch.** Generate a block for a goal race from methodology templates (Daniels,
  Pfitzinger, Hansons, Lydiard, Norwegian threshold, polarized 80/20) or your own method, with the reasons for every
  number. Templates are plain Markdown + YAML in [`methodologies/`](methodologies/); the research behind the rules is in
  [`methodologies/research/`](methodologies/research/).
- **Adaptive engine.** Missed key sessions move, missed kilometres are rebalanced within safe caps, a fatigue guard
  softens sessions when TSB or ACWR enter the red zone, and every change is explained and can be undone.
- **Real-life planning.** Sick/pause periods with a graded return, minor races inside a block (test, build or just for
  fun), a rolling base block between goal races, a season timeline.
- **Run analysis.** Garmin activities with aligned streams (pace, HR, elevation, cadence), splits, HR zones, map,
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
node scripts/migrate-schema.mjs   # creates the tables in DATABASE_URL (idempotent, safe to re-run)
npm run dev                       # http://localhost:3001
```

1. **Neon:** create a project (EU region recommended, e.g. `aws-eu-central-1`) and copy the pooled connection string
   into `DATABASE_URL`.
2. **Clerk:** create an application, copy the publishable and secret keys. To restrict sign-in with `ALLOWED_EMAILS`,
   add the email to the session token: Clerk Dashboard → Sessions → Customize session token →
   `{ "email": "{{user.primary_email_address}}" }`. Sessions without that claim are rejected while an allowlist is set.
3. **Vercel:** import the repository, add the same environment variables, deploy. `vercel.json` schedules the daily
   Garmin sync (`/api/cron/daily-sync`, 06:00 UTC); Vercel sends `CRON_SECRET` with it.
4. Sign in, open **Saison**, add a goal race and create its plan (**Plan erstellen**).

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
| `CRON_SECRET` | for the cron | Secret the daily sync route checks (Vercel Cron sends it) |
| `GARMIN_USERNAME`, `GARMIN_PASSWORD` | no | Garmin Connect login for the sync (unofficial, experimental; see below) |
| `APP_HOST` | no | Public host for calendar and Health links (e.g. `www.example.com`); default: the request host |

### Your values

Heart-rate zones, race HR caps and athlete facts are **example defaults** until per-user profiles land: HFmax 190,
resting HR 60 (`lib/analytics/hr.ts`) and a sample PB/weight (`lib/athlete.ts`). Edit them for your install.

## Data sources

| Source | Self-host | Status |
|---|---|---|
| Garmin | Unofficial `garmin-connect` login with your own credentials, flagged experimental. Planned: Garmin Connect Developer Program (Personal key for your own data) | Works today; the npm package is unmaintained since 01/2024 |
| Apple Health | iOS Shortcut posting to your per-install secret link (`/api/health/[token]`) | Works today |
| File import (FIT / GPX / TCX / Garmin export ZIP) | Account-free | Planned |
| Strava | OAuth; 2026 API terms limit caching (7 days), AI use and showing data to others — an import trigger, not the source of record | Planned, after launch |
| Polar / COROS / Suunto / Wahoo | — | Later |

You are responsible for using each source within its terms.

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
