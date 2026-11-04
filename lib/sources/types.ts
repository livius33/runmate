// The data-source adapter (Phase 3). Every way activities or wellness data reach Runmate — the Garmin login, the
// Apple Health Shortcut, file uploads, later the official Garmin API or Strava — implements ActivitySource and hands
// over the normalised shapes below. Only lib/sources/ingest.ts turns them into rows; metrics and the plan read rows.

export type SourceId = 'garmin' | 'garmin-api' | 'apple-health' | 'file' | (string & {})

export interface SourceCapabilities {
  activities: boolean       // delivers activity summaries
  detailStreams: boolean    // delivers laps + per-sample streams
  dailyWellness: boolean    // delivers daily values (sleep, resting HR, HRV, …)
  // pull: Runmate fetches (Garmin login, Strava). push: the source posts to Runmate (Shortcut, official Garmin API).
  // upload: the user hands over files.
  mode: 'pull' | 'push' | 'upload'
  history: boolean          // can fill the past, not only new activities
  runs: boolean             // its activities include runs (Apple running workouts are skipped when one is connected)
}

export interface SourceMeta {
  id: SourceId
  label: string             // German, shown in Settings
  description: string
  // credentials: username/password (encrypted). oauth: authorizeUrl → connect({ code }). link: a secret per-user URL.
  // upload: nothing to connect.
  auth: 'credentials' | 'oauth' | 'link' | 'upload'
  experimental?: boolean    // unofficial access that may break
  available: boolean        // false = placeholder, not implemented yet
  capabilities: SourceCapabilities
}

// ─── Normalised data ──────────────────────────────────────────────────────────

export interface ActivitySummary {
  sourceActivityId: string
  startUtc: string | null   // ISO 8601 with Z; null only when the source knows local time only
  startLocal: string        // 'YYYY-MM-DDTHH:MM:SS', wall-clock time where the activity happened
  sport: string             // Garmin-style type key ('running', 'trail_running', 'strength_training', 'cycling', …)
  name: string | null
  distanceM: number
  movingS: number
  elapsedS: number
  elevationGainM: number | null
  avgSpeedMs: number | null
  maxSpeedMs: number | null
  avgHr: number | null
  maxHr: number | null
  avgCadenceSpm: number | null   // steps per minute (both feet)
  calories: number | null
  startLat: number | null
  startLng: number | null
}

export interface Lap {
  distanceM: number
  durationS: number
  elevationGainM: number | null
  avgSpeedMs: number | null
  avgHr: number | null
}

type Series = (number | null)[]

// Aligned per-sample series: index i is the same moment in every series (null where nothing was recorded). This is
// the shape Garmin's chart data has always been parsed into (garmin-login/map.ts parseDetailStreams).
export interface DetailStreams {
  time: Series | null          // epoch ms
  distance: Series | null      // cumulative metres
  moving: Series | null        // cumulative moving seconds
  speed: Series | null         // m/s
  altitude: Series | null      // m
  heartrate: Series | null
  cadence: Series | null       // steps per minute
  temperature: Series | null   // °C
  latlng: ([number, number] | null)[] | null
}

export interface ActivityDetail { laps: Lap[]; streams: DetailStreams | null }

export interface ParsedActivity { summary: ActivitySummary; detail: ActivityDetail }

export interface DailyWellness {
  date: string
  sleepMin: number | null
  restingHr: number | null
  hrvMs: number | null
  steps: number | null
  activeKcal: number | null
  weightKg: number | null
}

// One night as a pull source delivers it: the night that ends on `date` (the morning). All values null = a night
// without data (watch not worn). lib/wellness/ stores it; lib/analytics/recovery-data.ts reads it.
export interface WellnessNight {
  date: string
  sleepS: number | null
  deepS: number | null
  remS: number | null
  sleepScore: number | null
  hrvAvg: number | null              // overnight HRV average, ms
  hrvStatus: string | null           // the source's own HRV verdict, upper case (Garmin: BALANCED, LOW, …)
  rhr: number | null
  rhrSource: 'night' | 'day' | null  // 'day' = the day's resting HR (fallback, never used for flags)
  sleepSource?: 'apple'              // sleep duration filled from Apple Health when the source has no night
}

// ─── Status and errors ────────────────────────────────────────────────────────

export type SourceErrorCode =
  | 'not-connected' | 'auth' | 'mfa' | 'locked' | 'rate-limited' | 'login-changed' | 'unavailable' | 'invalid' | 'unknown'

// Messages are German and safe to show: never credentials, tokens or raw library output.
export class SourceError extends Error {
  constructor(readonly code: SourceErrorCode, message: string) {
    super(message)
    this.name = 'SourceError'
  }
}

export interface SourceStatus {
  connected: boolean
  lastSyncAt: string | null
  error: { code: SourceErrorCode; message: string; at: string | null } | null
  details?: Record<string, string | number | boolean | null>   // source-specific, never secrets
}

export interface SyncResult {
  inserted: number
  updated: number
  duplicates: number
  enriched: number
  failed: number
  remaining: number
  log: string[]
}

export interface LastSync extends Omit<SyncResult, 'log'> {
  at: string
  source: SourceId
  error?: string
  errorCode?: SourceErrorCode
}

// One row of GET /api/sources (Settings, header button).
export type SourceInfo = SourceMeta & { status: SourceStatus; lastSync: LastSync | null; consent?: string[] }
export interface SourcesResponse { sources: SourceInfo[]; canSync: boolean; lastSync: LastSync | null }

export type ListQuery = { since: Date } | { page: number; pageSize: number }

// ─── The adapter ──────────────────────────────────────────────────────────────

// Every method runs inside a user scope (lib/server/scope.ts) and acts for that user only.
export interface ActivitySource {
  meta: SourceMeta
  status(): Promise<SourceStatus>
  // Source-specific input: { username, password, consent } for credentials, { code } for an OAuth callback.
  connect?(input: unknown): Promise<SourceStatus>
  // OAuth sources: where to send the user; `state` comes back with the callback.
  authorizeUrl?(state: string): string
  disconnect(): Promise<void>
  // Newest first. `since` = everything started at or after it; `page` = one page of the full history.
  listActivities?(q: ListQuery): Promise<{ items: ActivitySummary[]; hasMore: boolean }>
  getActivityDetail?(sourceActivityId: string): Promise<ActivityDetail>
  getDaily?(date: string): Promise<DailyWellness | null>
  // Pull sources with dailyWellness: fetch one night from the source (the sync's wellness step, lib/wellness/sync.ts).
  // `requestsLeft` = requests this sync may still make; returns how many it used. Throws SourceError.
  fetchNight?(date: string, requestsLeft: number): Promise<{ night: WellnessNight; requests: number }>
  // cross-user: the cron's list of whom to sync (pull sources), least recently synced first.
  connectedUsers?(): Promise<string[]>
  // Called after a successful sync (e.g. to clear a stored error state).
  markSynced?(error?: SourceError | null): Promise<void>
}

export interface UploadSource extends ActivitySource {
  // One file → its activities (a ZIP holds many). Throws SourceError('invalid') with a German message.
  parseFile(name: string, bytes: Uint8Array): Promise<ParsedActivity[]>
}

export const isUploadSource = (s: ActivitySource): s is UploadSource => typeof (s as UploadSource).parseFile === 'function'
