// Source `garmin-api`: PLACEHOLDER for the official Garmin Connect Developer Program (Activity API + Health API).
// Not implemented; it is registered with `available: false` so Settings can say it is coming and the contract test
// keeps the interface honest for it.
//
// How it will plug in (docs/LAUNCH-PLAN.md "Data sources"):
// - Auth: OAuth (Garmin's partner OAuth). `authorizeUrl(state)` sends the user to Garmin; the callback route calls
//   `connect({ code, verifier })`, which exchanges the code and stores the user token in its own table
//   (`garmin_api_accounts`, encrypted with lib/crypto.ts like `garmin_accounts`), keyed by user and Garmin user id.
// - Mode `push`: Garmin posts activity and daily summaries to a webhook (one route for all users; the Garmin user id
//   in each notification names our user). The webhook maps them to ActivitySummary / DailyWellness and calls
//   lib/sources/ingest.ts `upsertSummary` / the health store, inside `runAsUser`.
// - Detail: FIT files from the activity-file callback → the same parser as the file import (lib/sources/file/fit.ts).
// - History: none before the connect date under the Starter program → the Garmin data-export ZIP import fills it.
// - Personal (self-host) vs. Starter (hosted) keys differ only in configuration (env vars), not in code.
import { SourceError, type ActivitySource } from './types'

const unavailable = () => new SourceError('unavailable', 'Die offizielle Garmin-Schnittstelle ist noch nicht verfügbar.')

export const garminApiSource: ActivitySource = {
  meta: {
    id: 'garmin-api',
    label: 'Garmin Connect (offizielle Schnittstelle)',
    description: 'Geplant: Aktivitäten und Tageswerte über Garmins offizielles Entwicklerprogramm, ohne Passwort.',
    auth: 'oauth',
    available: false,
    capabilities: { activities: true, detailStreams: true, dailyWellness: true, mode: 'push', history: false, runs: true },
  },
  async status() { return { connected: false, lastSyncAt: null, error: null } },
  async connect() { throw unavailable() },
  async disconnect() { throw unavailable() },
  async listActivities() { throw unavailable() },
  async getActivityDetail() { throw unavailable() },
  async getDaily() { throw unavailable() },
}
