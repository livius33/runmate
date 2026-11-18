# Phase 3 · Data sources — plan

Branch `phase-3-sources` (from `main`, local only). Builds on Phase 2 (per-user scope, `garmin_accounts`, link tokens,
cron per user).

## Objective

Activity and wellness data come in through one adapter, `ActivitySource`, instead of Garmin-specific code paths. This
phase ships three sources behind it:

1. **Garmin (login)** — the existing unofficial `garmin-connect` login, per user, with the user's own Garmin
   username/password stored encrypted. Livius approved this for the hosted app too. It is marked `experimental`
   and is one source among several, so the official Garmin Connect API (and others) can be added without a rebuild.
2. **Apple Health** — the existing iOS Shortcut → `/api/health/[token]` flow, as a push source with daily wellness data.
3. **File import** — .FIT, .GPX, .TCX and a Garmin data-export .ZIP, deduplicated against what is already there.

Strava is **not** built in this phase; the interface must fit an OAuth source (see "OAuth fit").

## Design

`lib/sources/`:

- `types.ts` — the contract:
  - `SourceMeta { id, label, description, auth: 'credentials' | 'oauth' | 'link' | 'upload', experimental?, available,
    capabilities }`, `capabilities { activities, detailStreams, dailyWellness, mode: 'pull' | 'push' | 'upload',
    history, runs }`.
  - `ActivitySummary` (normalised: `sourceActivityId`, `startUtc`, `startLocal`, `sport` key, distance, moving/elapsed
    time, elevation, speeds, HR, cadence, calories, start position, name).
  - `ActivityDetail { laps: Lap[]; streams: DetailStreams | null }` where `DetailStreams` is exactly today's
    `parseDetailStreams` output (aligned per-sample series: time, distance, moving, speed, altitude, heartrate,
    cadence, temperature, latlng).
  - `DailyWellness` (sleep, resting HR, HRV, steps, active kcal, weight).
  - `ActivitySource { meta; status(); connect?(input); disconnect(); listActivities?({ since } | { page, pageSize });
    getActivityDetail?(id); getDaily?(date); connectedUsers?() }` and `UploadSource` adding
    `parseFile(name, bytes) → ParsedActivity[]`.
  - `SourceError { code, message }` with German messages; codes `not-connected`, `auth`, `mfa`, `locked`,
    `rate-limited`, `login-changed`, `unavailable`, `unknown`.
- `registry.ts` — all sources (`garmin`, `garmin-api` stub, `apple-health`, `file`), `source(id)`, `pullSources()`,
  `connectedRunSources()`.
- `ingest.ts` — the only writer of activities from a source: `toActivityRow` (summary → row), `upsertSummary`
  (same `(user, source, source_activity_id)` → update, else cross-source duplicate check, else insert), `storeDetail`
  (streams + laps + flags, then `storeRunMetrics`). `store-metrics.ts` / `run-metrics.ts` keep reading only the stored
  normalised rows.
- `dedupe.ts` — pure `isDuplicate(a, b)`: start within ±2 min and distance within ±3 % → duplicate, whatever the
  source. Used before every insert.
- `sync.ts` — generic pull sync (recent days, one history page, enrich pending runs) for any pull source; the plan
  engine runs after a sync as today. Last sync per source in settings.
- `garmin-login/` — the `garmin-connect` code moved behind the interface: client factory (one client per request
  scope, built from `garmin_accounts`), mapping to `ActivitySummary`/`ActivityDetail`, error classification, connect
  (verifies the login before anything is saved), status with the last error state.
- `garmin-api.ts` — documented placeholder for the official Garmin Connect Developer Program source (push/OAuth,
  `available: false`, no implementation).
- `apple-health.ts` — link token = connection; `getDaily(date)` from `health_days`.
- `file/` — parsers (`fit.ts`, `gpx.ts`, `tcx.ts`, `zip.ts`), shared stream building (moving time, downsampling to
  ≤ 1 000 samples like Garmin's chart data), `index.ts` (`parseFile`).

Schema (new drizzle migration after the baseline):

- `activities`: `source text not null` + `source_activity_id text` + `started_at integer` (UTC epoch seconds, for
  dedupe); `unique(user_id, source, source_activity_id)`, index `(user_id, started_at)`; `garmin_activity_id` and the
  Strava-era `strava_id` columns removed (existing Garmin rows are migrated to `source = 'garmin'`). Manual
  cross-training entries get `source = 'manual'`.
- `garmin_accounts`: `consented_at`, `error_code`, `error_at` (no secrets).

API: `GET /api/sources` (meta + status of every source), `POST /api/sources/sync` (all connected pull sources),
`POST /api/sources/[id]/history` (one page), `PUT/DELETE /api/sources/[id]/connection`, `POST /api/import` (files).
The `/api/garmin/*` routes are replaced; the header sync button and Settings use the new routes.

Apple running workouts: skipped when the user has a connected source that provides runs (today: Garmin login);
otherwise a running workout that carries a distance becomes an activity (`source = 'apple-health'`, deduplicated).

### File import limits (pragmatic approach)

Vercel caps a request body at 4.5 MB. The browser therefore does the unpacking: it reads the Garmin export ZIP with
`fflate` (nested `UploadedFiles_*.zip` included), keeps only .fit/.gpx/.tcx entries, gzips each file and uploads
batches of ≤ 4 MB / ≤ 25 files per request. The server gunzips, enforces ≤ 20 MB per decompressed file, parses,
dedupes and stores. A single file whose compressed size is over 4 MB is rejected in the browser with a German message
(rare: a 20 MB GPX compresses to ~2–3 MB). The server also accepts plain files and small ZIPs directly (self-host,
curl, tests). No blob storage needed.

### OAuth fit (Strava later)

`connect(input)` takes source-specific input (credentials now, an OAuth callback `{ code }` later); an OAuth source adds
`authorizeUrl(state)` and stores its tokens in its own encrypted table, exactly like `garmin_accounts`. Strava's terms
(7-day cache, own data only) make it an import trigger rather than a source of record; `capabilities.history` and
`mode` express that.

## Acceptance criteria

- **AC-1 Contract.** Given every registered source, when the contract test runs with fixtures, then each source's
  declared capabilities match the methods it implements, every summary is normalised (valid times, non-negative
  numbers, sport key), and every detail has aligned streams (all series the same length or null) and valid laps.
  Unavailable sources (official Garmin API) declare `available: false` and throw `SourceError('unavailable')`.
- **AC-2 Neutral ids.** Given activities from different sources, when they are stored, then they carry `source` +
  `source_activity_id`, unique per user+source+id; the same source id twice updates the row (enrichment fields kept);
  no code reads `garmin_activity_id`.
- **AC-3 Garmin via the interface.** Given a user with a Garmin login, when the 28-day sync, the history pages or the
  per-run enrichment run, then they go through `ActivitySource` (mocked client in tests) and store the same rows,
  streams and metrics as before; one client per request scope; the cron syncs every user with a connected pull source.
- **AC-4 Garmin errors.** Given a wrong password, MFA, a locked account, rate limiting or a changed Garmin login, when
  the user connects or syncs, then Settings shows a clear German message for that case; nothing is saved on a failed
  connect; the error state is stored as a code only.
- **AC-5 Secrets.** Given credentials that the library echoes in its error, when connecting fails or succeeds, then
  neither logs nor API responses contain the username or password; the DB receives them only encrypted.
- **AC-6 Consent.** Given the Settings "Verbinden" form, then it shows the consent text (stored encrypted, used only to
  fetch the user's own data, deletable any time, unofficial access that may break) and the API refuses without
  consent; the source is labelled experimental.
- **AC-7 Apple Health.** Given the per-user link, when the Shortcut posts, then daily values are stored for that user
  and `getDaily(date)` returns them; running workouts are skipped iff the user has a connected run source, otherwise a
  run with a distance becomes a deduplicated activity. Settings shows the link and a German install guide.
- **AC-8 File import.** Given synthetic .FIT, .GPX, .TCX files and a ZIP of them, when imported, then each becomes an
  activity with streams and metrics; the same file twice, or the same run from another source (start ±2 min,
  distance ±3 %), is skipped; files over 20 MB and unknown types are rejected with German messages.
- **AC-9 Isolation.** Given two users importing files, then each import is stored and deduplicated only within that
  user's data.
- **AC-10 No regression.** `npx tsc --noEmit` clean, `npx vitest run` green, `npx next build` without DB env, and
  `npx tsx scripts/snapshot-plan.mts` byte-identical to `main`.

## Tasks

1. Plan (this file).
2. Install: real `node_modules` in the repo; parsers `fit-file-parser` (MIT), `fast-xml-parser` (MIT), `fflate` (MIT),
   pinned exact versions.
3. Interface, registry, ingest, dedupe; schema + migration; port callers (enrich route, run page, backfill, store).
4. Garmin login source (client factory, mapping, errors, connect/status), sync generic, cron, routes; official API stub.
5. Apple Health source; per-user running-workout rule.
6. File import (parsers, ZIP, route, client-side splitting).
7. Settings: "Datenquellen" (Garmin form with consent and error states, Apple Health, import), header sync.
8. Tests: contract (all sources), dedupe, Garmin mocked client + errors + no plaintext, Apple rule, import isolation.
9. Docs: README / CLAUDE.md / LAUNCH-PLAN data-sources row, SUMMARY.md.

## Boundaries

- No push, no remote; the personal dashboard checkout stays untouched (its `node_modules` too).
- No implementation of the official Garmin API or Strava — interface fit and a stub only.
- No change to plan generation, the engine or `run-metrics.ts` (no `METRICS_VERSION` bump needed).
- No personal data in fixtures: all FIT/GPX/TCX fixtures are generated synthetically in the tests.
- No MFA support for the Garmin login (detected and explained, not solved).
