import { GarminConnect } from 'garmin-connect'
import { db } from '@/lib/db'
import { activities, activityStreams } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { mine, own, uid } from '@/lib/db/owned'
import { currentScope } from '@/lib/scope'
import { loadGarminAccount, saveGarminSession, type GarminSession } from '@/lib/garmin/account'
import { storeRunMetrics } from '@/lib/analytics/store-metrics'
import { crossTypeForKey } from '@/lib/analytics/cross-training'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import type { PlanSession } from '@/lib/plan/types'
import { randomUUID } from 'crypto'

// ─── Types (subset — narrowed by usage) ───────────────────────────────────────

interface GarminListActivity {
  activityId: number
  activityName: string
  activityType: { typeKey: string; parentTypeId: number }
  startTimeLocal: string           // "2026-06-30 07:12:34"
  startTimeGMT: string
  distance: number                 // meters
  duration: number                 // seconds (elapsed)
  movingDuration: number
  elevationGain: number
  averageSpeed: number             // m/s
  maxSpeed: number
  averageHR: number | null
  maxHR: number | null
  averageRunningCadenceInStepsPerMinute: number | null
  calories: number | null
  startLatitude: number | null
  startLongitude: number | null
  hasPolyline: boolean
  hasSplits: boolean
}

interface GarminActivityDetails {
  activityId: number
  summaryDTO: {
    startTimeLocal: string
    startTimeGMT: string
    distance: number
    duration: number
    movingDuration: number
    elevationGain: number
    averageSpeed: number
    maxSpeed: number
    averageHR?: number
    maxHR?: number
    averageRunCadence?: number
    calories?: number
  }
  metadataDTO?: { hasPolyline: boolean; hasChartData: boolean }
  splitSummaries?: unknown[]
}

interface GarminSplit {
  distance: number
  duration: number
  elevationGain: number
  averageSpeed: number
  averageHR?: number
}

interface GarminChartMetric {
  metricsIndex: number
  key: string
  unit?: { key: string; factor: number }
}

interface GarminActivityDetailsResponse {
  activityId: number
  measurementCount: number
  metricsCount: number
  metricDescriptors: GarminChartMetric[]
  activityDetailMetrics: { metrics: (number | null)[] }[]
  geoPolylineDTO?: { polyline: { lat: number; lon: number }[] }
}

// ─── Session management (Vercel-serverless friendly) ──────────────────────────

const GC_RUNNING_TYPE_KEY = ['running', 'trail_running', 'street_running', 'track_running', 'treadmill_running', 'virtual_run', 'indoor_running']
// Imported: runs, plus cross-training (08-01: strength, swim, ride, gym — lib/analytics/cross-training.ts). Everything else stays out.
const imported = (a: GarminListActivity) => GC_RUNNING_TYPE_KEY.includes(a.activityType.typeKey) || crossTypeForKey(a.activityType.typeKey) != null

// One client per request and user (lib/scope.ts cache), built from that user's encrypted account: never shared
// between users or kept across requests in module state.
const CLIENT_KEY = 'garmin.client'

export async function getGarminClient(): Promise<GarminConnect> {
  uid()                                     // a user scope, or 401
  const cache = currentScope().cache
  const hit = cache.get(CLIENT_KEY) as Promise<GarminConnect> | undefined
  if (hit) return hit
  const p = connectGarmin().catch((err) => { cache.delete(CLIENT_KEY); throw err })
  cache.set(CLIENT_KEY, p)
  return p
}

async function connectGarmin(): Promise<GarminConnect> {
  const account = await loadGarminAccount()
  if (!account) throw new Error('Kein Garmin-Konto hinterlegt (Einstellungen → Garmin)')
  const { username, password, session } = account
  const gc = new GarminConnect({ username, password })
  if (session?.oauth2) {
    try {
      gc.loadToken(session.oauth1 as never, session.oauth2 as never)
      // Cheap probe: getUserProfile — if OAuth2 expired, this throws.
      await gc.getUserProfile()
      return gc
    } catch {
      // token stale → fall through to full login
    }
  }
  try {
    await gc.login(username, password)
  } catch {
    // The library's message may echo request details; say only what failed.
    throw new Error('Garmin-Anmeldung fehlgeschlagen (Zugangsdaten prüfen)')
  }
  await saveGarminSession(gc.exportToken() as unknown as GarminSession)
  return gc
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function typeForDb(typeKey: string): { type: string; sportType: string | null } {
  if (typeKey.includes('trail'))    return { type: 'TrailRun', sportType: typeKey }
  if (typeKey.includes('treadmill') || typeKey === 'indoor_running' || typeKey === 'virtual_run')
    return { type: 'VirtualRun', sportType: typeKey }
  if (typeKey.includes('running') || typeKey === 'street_running' || typeKey === 'track_running')
    return { type: 'Run', sportType: typeKey }
  // Cross-training: Strength | Swim | Ride | Gym (08-01).
  const cross = crossTypeForKey(typeKey)
  if (cross) return cross
  // Anything else: bucket under the raw type so we don't silently lose it.
  const cap = typeKey.charAt(0).toUpperCase() + typeKey.slice(1)
  return { type: cap, sportType: typeKey }
}

function toActivityRow(a: GarminListActivity) {
  const startDateTime = a.startTimeLocal.replace(' ', 'T')
  const date = startDateTime.slice(0, 10)
  const startTime = startDateTime.slice(11, 19) || null

  const { type, sportType } = typeForDb(a.activityType.typeKey)
  const run = RUN_ACTIVITY_TYPES.includes(type)
  // Pace and step cadence are run numbers; a ride or a swim keeps distance and speed only.
  const paceSPerKm = run && a.averageSpeed > 0 ? Math.round(1000 / a.averageSpeed) : null

  return {
    id: randomUUID(),
    stravaId: null,
    garminActivityId: String(a.activityId),
    type,
    sportType,
    workoutType: null as number | null,
    name: a.activityName || `${type} ${date}`,
    description: null as string | null,
    distanceM: a.distance ?? 0,
    durationS: Math.round(a.duration ?? a.movingDuration ?? 0),
    elapsedTimeS: Math.round(a.duration ?? 0),
    elevationM: a.elevationGain ?? null,
    averageHr: a.averageHR ?? null,
    maxHr: a.maxHR ?? null,
    avgCadence: run && a.averageRunningCadenceInStepsPerMinute
      ? Math.round(a.averageRunningCadenceInStepsPerMinute)
      : null,
    averagePaceSPerKm: paceSPerKm,
    averageSpeedMs: a.averageSpeed ?? null,
    maxSpeedMs: a.maxSpeed ?? null,
    calories: a.calories ?? null,
    sufferScore: null as number | null,
    perceivedExertion: null as number | null,
    prCount: null as number | null,
    kudosCount: null as number | null,
    achievementCount: null as number | null,
    gearId: null as string | null,
    startLat: a.startLatitude ?? null,
    startLng: a.startLongitude ?? null,
    startTime,
    summaryPolyline: null as string | null,
    bestEffortsJson: null as string | null,
    splitsMetricJson: null as string | null,
    hasDetailedData: false,
    hasStreams: false,
    date,
    notes: null as string | null,
  }
}

// ─── Sync (recent) ────────────────────────────────────────────────────────────

// Fields owned by the enrichment pipeline (enrichActivityDetail/enrichActivityStreams) —
// the list endpoint that feeds toActivityRow never carries these, so re-syncing an
// existing activity must not clobber them back to null/false.
const ENRICHMENT_OWNED_FIELDS = [
  'splitsMetricJson', 'bestEffortsJson', 'hasDetailedData', 'hasStreams',
  'sufferScore', 'perceivedExertion', 'prCount', 'kudosCount', 'achievementCount',
  'gearId', 'summaryPolyline', 'notes',
] as const

// Upsert on garmin_activity_id — if we've seen it before, refresh mutable fields.
async function upsertRow(row: ReturnType<typeof toActivityRow>) {
  const [existing] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(own(activities, eq(activities.garminActivityId, row.garminActivityId!)))
    .limit(1)

  if (existing) {
    const { id: _drop, garminActivityId: _drop2, ...rest } = row
    const updatable = { ...rest }
    for (const field of ENRICHMENT_OWNED_FIELDS) delete (updatable as any)[field]
    await db.update(activities).set(updatable).where(own(activities, eq(activities.id, existing.id)))
    return { inserted: 0, updated: 1 }
  }

  await db.insert(activities).values(mine(row))
  return { inserted: 1, updated: 0 }
}

export async function syncGarminActivities(days = 28) {
  const gc = await getGarminClient()
  const now = Date.now()
  const cutoff = now - days * 86_400_000
  let inserted = 0
  let updated = 0
  let start = 0
  const pageSize = 50

  while (true) {
    const page = (await gc.getActivities(start, pageSize)) as unknown as GarminListActivity[]
    if (!page.length) break

    for (const a of page) {
      const localMs = new Date(a.startTimeLocal.replace(' ', 'T')).getTime()
      if (localMs < cutoff) return { inserted, updated }
      if (!imported(a)) continue

      const row = toActivityRow(a)
      const r = await upsertRow(row)
      inserted += r.inserted
      updated += r.updated
    }

    if (page.length < pageSize) break
    start += pageSize
  }

  return { inserted, updated }
}

// ─── Sync (full history, one page at a time) ──────────────────────────────────

export async function syncGarminActivitiesPage(page: number, pageSize = 50) {
  const gc = await getGarminClient()
  const start = page * pageSize
  const results = (await gc.getActivities(start, pageSize)) as unknown as GarminListActivity[]

  let inserted = 0
  let updated = 0
  for (const a of results) {
    if (!imported(a)) continue
    const row = toActivityRow(a)
    const r = await upsertRow(row)
    inserted += r.inserted
    updated += r.updated
  }

  return { inserted, updated, hasMore: results.length === pageSize }
}

// ─── Enrichment: details, splits, streams ─────────────────────────────────────

// Splits, streams and run metrics are run data: a cross-training row (08-01) is never enriched.
async function assertRun(garminActivityId: string) {
  const [row] = await db.select({ type: activities.type }).from(activities).where(own(activities, eq(activities.garminActivityId, garminActivityId))).limit(1)
  if (row && !RUN_ACTIVITY_TYPES.includes(row.type)) throw new Error(`Activity ${garminActivityId} is ${row.type}, not a run: no detail data`)
}

export async function enrichActivityDetail(garminActivityId: string) {
  await assertRun(garminActivityId)
  const gc = await getGarminClient()
  const details = (await gc.getActivity({
    activityId: Number(garminActivityId),
  })) as unknown as GarminActivityDetails

  // Splits — separate endpoint
  let splits: GarminSplit[] = []
  try {
    const splitsResp = await gc.get<{ lapDTOs: GarminSplit[] }>(
      `https://connectapi.garmin.com/activity-service/activity/${garminActivityId}/splits`,
    )
    splits = splitsResp.lapDTOs ?? []
  } catch { /* non-fatal */ }

  await db
    .update(activities)
    .set({
      splitsMetricJson: splits.length ? JSON.stringify(splits) : null,
      hasDetailedData: true,
    })
    .where(own(activities, eq(activities.garminActivityId, garminActivityId)))
}

// Garmin's per-sample chart data → aligned series. Every series has one entry per sample
// (null where Garmin recorded nothing), so index i means the same moment in all of them.
export function parseDetailStreams(chart: GarminActivityDetailsResponse) {
  // Manually entered activities come back without chart data.
  const index = new Map((chart.metricDescriptors ?? []).map((m) => [m.key, m.metricsIndex]))
  const rows = chart.activityDetailMetrics ?? []
  const series = (...keys: string[]): (number | null)[] | null => {
    const key = keys.find((k) => index.has(k))
    if (!key) return null
    const i = index.get(key)!
    const out = rows.map((r) => (r.metrics[i] ?? null) as number | null)
    return out.some((v) => v != null) ? out : null
  }
  const lat = series('directLatitude')
  const lon = series('directLongitude')
  const perLeg = series('directRunCadence')
  return {
    time: series('directTimestamp'),
    distance: series('sumDistance'),
    moving: series('sumMovingDuration'),
    speed: series('directSpeed'),
    altitude: series('directElevation'),
    heartrate: series('directHeartRate'),
    // Full cadence in steps/min; directRunCadence is per leg.
    cadence: series('directDoubleCadence') ?? (perLeg && perLeg.map((v) => (v == null ? null : v * 2))),
    temperature: series('directAirTemperature'),
    latlng: lat && lon ? lat.map((a, i) => (a != null && lon[i] != null ? [a, lon[i]!] as [number, number] : null)) : null,
  }
}

export async function enrichActivityStreams(garminActivityId: string, plan?: PlanSession[]) {
  await assertRun(garminActivityId)
  const gc = await getGarminClient()

  const chart = await gc.get<GarminActivityDetailsResponse>(
    `https://connectapi.garmin.com/activity-service/activity/${garminActivityId}/details?maxChartSize=1000&maxPolylineSize=1000`,
  )
  const st = parseDetailStreams(chart)

  // Look up internal id for this Garmin activity so we can key by activity_id.
  const [act] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(own(activities, eq(activities.garminActivityId, garminActivityId)))
    .limit(1)
  if (!act) throw new Error(`Activity ${garminActivityId} not in DB`)

  const json = (v: unknown) => (v ? JSON.stringify(v) : null)
  const values = {
    timeJson: json(st.time),
    distanceJson: json(st.distance),
    movingJson: json(st.moving),
    speedJson: json(st.speed),
    altitudeJson: json(st.altitude),
    heartrateJson: json(st.heartrate),
    cadenceJson: json(st.cadence),
    temperatureJson: json(st.temperature),
    gradeJson: null,
    latlngJson: json(st.latlng),
    fetchedAt: Math.floor(Date.now() / 1000),
  }
  await db
    .insert(activityStreams)
    .values(mine({ activityId: act.id, stravaId: null, ...values }))
    .onConflictDoUpdate({ target: [activityStreams.userId, activityStreams.activityId], set: values })

  await db
    .update(activities)
    .set({ hasStreams: true })
    .where(own(activities, eq(activities.id, act.id)))

  await storeRunMetrics(act.id, plan)
}
