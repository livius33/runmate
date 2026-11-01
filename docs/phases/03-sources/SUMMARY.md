# Phase 3 · Data sources — summary

Branch `phase-3-sources` (from `main`, local only, not pushed). Plan: docs/phases/03-sources/PLAN.md.

Commits: `0e05119` plan · `58996d4` deps · `dfd0315` adapter, ingest, dedupe, neutral ids, migration · `e67addd` Garmin
login source + official-API stub · `4f68192` Apple Health source · `d6504be` file import · `9a0250d` Settings ·
`ad5e022` tests · `e6a4e68` docs.

## What shipped

**Adapter (`lib/sources/`).** `types.ts` is the contract: `SourceMeta` (id, German label, auth `credentials | oauth |
link | upload`, `experimental`, `available`, capabilities `activities / detailStreams / dailyWellness / mode
pull|push|upload / history / runs`), normalised `ActivitySummary`, `ActivityDetail { laps, streams }` (streams =
exactly the `parseDetailStreams` shape), `DailyWellness`, `SourceError { code, German message }`. An `ActivitySource`
has `status / connect? / authorizeUrl? / disconnect / listActivities?({since}|{page}) / getActivityDetail? / getDaily? /
connectedUsers? / markSynced?`; `UploadSource` adds `parseFile`. `registry.ts` lists `garmin`, `garmin-api` (stub),
`apple-health`, `file`. `ingest.ts` is the only writer of source activities (`upsertSummary` → update / duplicate /
insert; `storeDetail` → streams + laps + `storeRunMetrics`); `store-metrics.ts` and `run-metrics.ts` are unchanged and
read only stored normalised rows. `dedupe.ts`: start ±2 min and distance ±3 % = same activity, any source (UTC start,
falling back to local wall time). `sync.ts`: generic pull sync, history pages, enrichment, last sync per source; the
cron syncs every user with a connected pull source.

**Migration `drizzle/0001_activity_source.sql`.** `activities.source` (not null) + `source_activity_id` +
`started_at`; `unique(user_id, source, source_activity_id)`, index `(user_id, started_at)`; `garmin_activity_id` and
the Strava-era `strava_id` columns (activities, activity_streams) dropped — existing rows migrated (`garmin` with their
id, otherwise `manual`). `garmin_accounts`: `consented_at`, `error_code`, `error_at`. Generated with drizzle-kit (two
passes to avoid the rename prompt, merged into one file with the data step); `db:generate` reports no drift. Not run
against a live DB (none exists).

**Garmin login (`garmin`, experimental).** garmin-connect code behind the interface: one client per request scope from
the encrypted account, no process-global client. `connect` logs in first and saves only a working login (credentials,
session, consent time). Hardened client: MFA page → `mfa`, HTTP errors → status only (library no longer logs response
bodies). Error codes with German messages: `auth`, `mfa`, `locked` (also "update phone number"), `rate-limited`,
`login-changed`, `unavailable`, `not-connected`, `unknown`; last error stored as a code and shown in Settings. Routes:
`GET /api/sources`, `POST /api/sources/sync`, `POST /api/sources/[id]/history`, `PUT/DELETE
/api/sources/[id]/connection` (replace `/api/garmin/*`). `garmin-api.ts` documents how the official Developer Program
source plugs in (OAuth, push webhook, FIT callback, Starter history via ZIP).

**Apple Health (`apple-health`, push).** Link token = connection; `getDaily(date)` from `health_days`. Running
workouts are skipped only if another connected source delivers runs (today: the Garmin login); otherwise a run with
`distanceKm` becomes a deduplicated activity. Settings card text and guide follow that rule.

**File import (`file`).** `.fit` (fit-file-parser; session totals, laps, the watch's local offset), `.gpx`/`.tcx`
(fast-xml-parser, strict validation, no entity expansion), `.zip` incl. the nested `UploadedFiles_*.zip`, `.gz`.
Streams downsampled to 1 000 samples like Garmin's chart data; moving time from pauses/speed; climb with a 2 m dead
band. Source id = SHA-256 of the file. **Size approach:** the browser streams the export ZIP with fflate, keeps
activity files, gzips each and uploads batches ≤ 4 MB / 25 files (`POST /api/import`, `?final=1` runs the engine
once); the server enforces 20 MB per decompressed file (gzip trailer checked before inflating). No blob storage.

**Settings → Datenquellen:** Garmin card (Verbinden form with consent checkbox and the three consent sentences,
"experimentell" badge, error box, sync / full history / change / disconnect-and-delete), Apple Health, Datei-Import
(progress, counts, per-file errors), official API as "in Vorbereitung". Header sync uses `/api/sources`.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC-1 contract | ✅ | `tests/sources/contract.test.ts`: every registered source; capabilities ↔ methods, normalised summaries, aligned streams, stub throws `unavailable` |
| AC-2 neutral ids | ✅ | `neutral-ids.test.ts` (schema, no `garminActivityId` anywhere, only ingest + manual entries insert); `import.test.ts` (same id → update, detail fields untouched) |
| AC-3 Garmin via interface | ✅ | `garmin.test.ts`: since/page listing, filtering, detail, sync inserts, one client per scope and user |
| AC-4 error states | ✅ | `garmin.test.ts`: 10 failure shapes → code + German message, nothing saved; error code stored on sync failure |
| AC-5 secrets | ✅ | `garmin.test.ts`: library error echoing email/password → route body and all console output clean; SQL params encrypted only (incl. OAuth tokens) |
| AC-6 consent | ✅ | connect refuses without `consent: true` (no login attempt); form shows the text; `experimental` in meta |
| AC-7 Apple Health | ✅ | `apple-health.test.ts`: per-user rule through the real route, run summary, start parsing; `getDaily` in the contract test |
| AC-8 file import | ✅ | `file.test.ts` (FIT/GPX/TCX/ZIP/gz, run metrics on the streams: 5 splits, limits, German errors); `import.test.ts` (same file twice, GPX after Garmin, other sports) |
| AC-9 isolation | ✅ | `import.test.ts`: two users import the same file concurrently; dedupe sees only own rows; every activities/streams query carries the right user |
| AC-10 no regression | ✅ | tsc clean; vitest 50 files / 418 passed + 1 todo (main: 44 / 360 + 1 → 58 new); `next build` without DB env OK; plan snapshot byte-identical to `main` (7,662,683 bytes) |

## Dependencies (exact versions, all ≥ 2 weeks old)

`fit-file-parser` 6.2.2 (MIT; dep `buffer` MIT), `fast-xml-parser` 5.11.2 (MIT; deps `strnum`, `is-unsafe`,
`xml-naming`, `fast-xml-builder`, `@nodable/entities`, `path-expression-matcher` — all MIT), `fflate` 0.8.3 (MIT).
All AGPL-compatible. `@tmcw/togeojson` not needed (needs a DOM). `node_modules` is now a real install in the repo.

## Decisions

- Uploads never count as a "connected run source": Apple runs are skipped only for pull/push run sources; uploads are
  one-off and deduplicated anyway.
- A duplicate is skipped, not merged: if a run came from a file first, a later Garmin sync of it is skipped.
- Laps are stored normalised in `splits_metric_json` (was Garmin's raw lapDTOs; nothing read them).
- `garmin-connect`'s token-refresh path still `console.log`s an axios error (library code, may include the bearer
  token); everything else that logged is overridden. Removing it needs a fork or the official API.

## For Livius to decide

1. MFA: users with Garmin two-factor get a clear message and the import; supporting the code prompt needs a two-step
   connect and library changes. Worth it, or wait for the official API?
2. Hosted + password login: consent text says "unofficial, may break". OK as worded, or legal review in Phase 4?
3. Cross-source duplicates: skip (now) or let a richer source replace a poorer one (e.g. Garmin replaces an Apple run)?
4. Fork `garmin-connect` (unmaintained, logs on refresh failure) into the repo, or accept it until the official API?
5. Server-side ZIP upload for self-hosters is bounded by the request size; add a configurable limit, or keep browser-only?
