// The only writer of activities that come from a source (lib/sources/types.ts): normalised summary → row (impossible
// values are rejected: PLAUSIBLE), the same source id → update, the same activity from another source → replaced when the new record is richer, else skipped,
// details → streams + laps + run metrics.
import { randomUUID } from 'crypto'
import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities, activityStreams } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { storeRunMetrics } from '@/lib/analytics/store-metrics'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import type { PlanSession } from '@/lib/plan/types'
import { isDuplicate, isRicher, START_TOLERANCE_S, type Richness } from './dedupe'
import { source as sourceById } from './registry'
import { typeForDb } from './sports'
import type { ActivityDetail, ActivitySummary, DetailStreams, SourceId } from './types'

const epochS = (iso: string | null) => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}

export function toActivityRow(source: SourceId, a: ActivitySummary) {
  const date = a.startLocal.slice(0, 10)
  const { type, sportType } = typeForDb(a.sport)
  const run = RUN_ACTIVITY_TYPES.includes(type)
  // Pace and step cadence are run numbers; a ride or a swim keeps distance and speed only.
  const speed = a.avgSpeedMs ?? (a.movingS > 0 && a.distanceM > 0 ? a.distanceM / a.movingS : null)
  return {
    id: randomUUID(),
    source,
    sourceActivityId: a.sourceActivityId,
    startedAt: epochS(a.startUtc),
    type,
    sportType,
    name: a.name || `${type} ${date}`,
    distanceM: a.distanceM ?? 0,
    durationS: Math.round(a.elapsedS || a.movingS || 0),
    elapsedTimeS: Math.round(a.elapsedS || 0),
    elevationM: a.elevationGainM,
    averageHr: a.avgHr != null ? Math.round(a.avgHr) : null,
    maxHr: a.maxHr != null ? Math.round(a.maxHr) : null,
    avgCadence: run && a.avgCadenceSpm ? Math.round(a.avgCadenceSpm) : null,
    averagePaceSPerKm: run && speed && speed > 0 ? Math.round(1000 / speed) : null,
    averageSpeedMs: speed,
    maxSpeedMs: a.maxSpeedMs,
    calories: a.calories != null ? Math.round(a.calories) : null,
    startLat: a.startLat,
    startLng: a.startLng,
    startTime: a.startLocal.slice(11, 19) || null,
    date,
  }
}
export type ActivityRow = ReturnType<typeof toActivityRow>

// What no real activity exceeds. A record beyond these is a recording error (a GPS jump once became a stored run of
// 17,793 km) and is not stored: it would feed load and plan. Each bound is a record with room to spare, so none of
// them can cost a real activity.
export const PLAUSIBLE = {
  // One recording. The longest races on a running clock last six to ten days; no watch records for more than a
  // few weeks on one charge.
  maxDurationS: 31 * 86_400,
  // On foot: 3100 miles (4,989 km) is the longest certified race there is, and it takes 40 days and more.
  maxRunDistanceM: 5_000_000,
  // Any other sport: twice the Race Across America (4,800 km), the longest ride done in one go.
  maxDistanceM: 10_000_000,
  // Average speed on foot: the fastest a human has been timed is 12.4 m/s (the peak of the 9.58 s 100 m world
  // record, whose average is 10.4 m/s). No run of any length averages more than that peak.
  maxRunSpeedMs: 12.5,
  // Average speed in any other sport: above every cycling record, motor-paced ones included (296 km/h = 82 m/s).
  maxSpeedMs: 100,
} as const

export interface Implausible { check: 'values' | 'duration' | 'distance' | 'speed'; message: string }   // message: German, for the user

const deKm = (m: number) => `${(Math.round(m / 100) / 10).toLocaleString('de-DE')} km`
const deHours = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} h`

// Why this activity cannot have happened, or null. Speed is judged over the longer of moving and elapsed time, so an
// odd moving time alone (auto-pause, a source that counts it differently) never rejects a real activity. An activity
// without distance (strength, a treadmill without a foot pod) only needs a possible duration.
export function implausible(a: Pick<ActivitySummary, 'sport' | 'distanceM' | 'movingS' | 'elapsedS'>): Implausible | null {
  const distanceM = a.distanceM ?? 0, movingS = a.movingS ?? 0, elapsedS = a.elapsedS ?? 0
  if (![distanceM, movingS, elapsedS].every((v) => Number.isFinite(v) && v >= 0)) return { check: 'values', message: 'Distanz oder Dauer ist negativ oder keine Zahl' }
  const run = RUN_ACTIVITY_TYPES.includes(typeForDb(a.sport).type)
  const longestS = Math.max(movingS, elapsedS)
  if (distanceM > 0 && longestS === 0) return { check: 'duration', message: `${deKm(distanceM)} ohne Dauer sind nicht möglich` }
  if (longestS > PLAUSIBLE.maxDurationS) return { check: 'duration', message: `eine Dauer über ${PLAUSIBLE.maxDurationS / 86_400} Tage ist nicht möglich` }
  const maxDistanceM = run ? PLAUSIBLE.maxRunDistanceM : PLAUSIBLE.maxDistanceM
  const maxSpeedMs = run ? PLAUSIBLE.maxRunSpeedMs : PLAUSIBLE.maxSpeedMs
  if (distanceM > 0 && distanceM / longestS > maxSpeedMs) return { check: 'speed', message: `${deKm(distanceM)} in ${deHours(longestS)} sind nicht möglich (über ${Math.round(maxSpeedMs * 3.6)} km/h im Schnitt)` }
  if (distanceM > maxDistanceM) return { check: 'distance', message: `${deKm(distanceM)} sind nicht möglich (über ${(maxDistanceM / 1000).toLocaleString('de-DE')} km)` }
  return null
}

// `incomplete` (only with `existing: 'skip'`): this very record is stored, but its detail data is not, because an
// earlier storeDetail failed after the row was written. The caller stores the detail again instead of skipping.
export type UpsertResult =
  | { result: 'inserted' | 'updated' | 'replaced' | 'duplicate'; id: string; incomplete?: boolean }
  | { result: 'rejected'; id: null; reason: Implausible }      // impossible values (PLAUSIBLE): nothing stored

// An activity from another source (or another id of the same source) that is the same one: ±2 min, ±3 %.
export async function findDuplicate(row: Pick<ActivityRow, 'startedAt' | 'date' | 'startTime' | 'distanceM'>): Promise<string | null> {
  const near = row.startedAt != null
    ? and(gte(activities.startedAt, row.startedAt - START_TOLERANCE_S), lte(activities.startedAt, row.startedAt + START_TOLERANCE_S))
    : undefined
  const candidates = await db
    .select({ id: activities.id, startedAt: activities.startedAt, date: activities.date, startTime: activities.startTime, distanceM: activities.distanceM })
    .from(activities)
    .where(own(activities, near ? or(near, and(isNull(activities.startedAt), eq(activities.date, row.date))) : eq(activities.date, row.date)))
  const key = (r: typeof row) => ({ startedAt: r.startedAt, startLocal: r.startTime ? `${r.date}T${r.startTime}` : null, distanceM: r.distanceM })
  return candidates.find((c) => isDuplicate(key(row), key(c)))?.id ?? null
}

// Same (source, source id) as before → refresh the summary fields (detail data already loaded stays), or with
// `existing: 'skip'` (a file imported again) leave it and report a duplicate. The same activity from another source
// → replace it when this record is richer (`detail`: what the caller will store next), else report a duplicate.
// Every source passes through here, so this is where an impossible activity stops (`rejected`, nothing written).
export async function upsertSummary(source: SourceId, summary: ActivitySummary, opts: { existing?: 'update' | 'skip'; detail?: ActivityDetail } = {}): Promise<UpsertResult> {
  const reason = implausible(summary)
  if (reason) return { result: 'rejected', id: null, reason }
  const row = toActivityRow(source, summary)
  const [existing] = await db
    .select({ id: activities.id, type: activities.type, hasDetailedData: activities.hasDetailedData })
    .from(activities)
    .where(own(activities, eq(activities.source, source), eq(activities.sourceActivityId, summary.sourceActivityId)))
    .limit(1)
  if (existing && opts.existing === 'skip') {
    // Only runs carry detail data (storeDetail), and storeDetail sets the flag as its last step.
    const incomplete = RUN_ACTIVITY_TYPES.includes(existing.type) && !existing.hasDetailedData
    return { result: 'duplicate', id: existing.id, ...(incomplete ? { incomplete } : {}) }
  }
  if (existing) {
    const { id: _id, source: _s, sourceActivityId: _sid, ...set } = row
    await db.update(activities).set(set).where(own(activities, eq(activities.id, existing.id)))
    return { result: 'updated', id: existing.id }
  }
  const dup = await findDuplicate(row)
  if (dup) {
    const theirs = await storedRichness(dup)
    if (!theirs || !isRicher(incomingRichness(source, summary, opts.detail), theirs)) return { result: 'duplicate', id: dup }
    await replaceActivity(dup, row, !opts.detail)
    return { result: 'replaced', id: dup }
  }
  await db.insert(activities).values(mine(row))
  return { result: 'inserted', id: row.id }
}

const hasData = (s: (unknown | null)[] | null) => !!s?.some((v) => v != null)
const STREAM_KEYS = ['time', 'distance', 'moving', 'speed', 'altitude', 'heartrate', 'cadence', 'temperature', 'latlng'] as const satisfies readonly (keyof DetailStreams)[]

// A pull source with detail streams (the Garmin login) fetches them after the summary: count them as coming.
const fetchesDetail = (id: string) => {
  const caps = sourceById(id as SourceId)?.meta.capabilities
  return !!caps?.detailStreams && caps.mode === 'pull'
}

function incomingRichness(source: SourceId, a: ActivitySummary, detail?: ActivityDetail): Richness {
  const st = detail?.streams
  const channels = st ? STREAM_KEYS.filter((k) => hasData(st[k])).length : 0
  const coming = !detail && fetchesDetail(source)
  return {
    detail: detail ? channels > 0 || detail.laps.length > 0 : coming,
    channels: coming ? null : channels,
    hr: a.avgHr != null || hasData(st?.heartrate ?? null),
  }
}

// What a stored activity carries: laps, streams (channels with data) and heart rate.
async function storedRichness(id: string): Promise<Richness | null> {
  const [a] = await db
    .select({ source: activities.source, hasDetailedData: activities.hasDetailedData, hasStreams: activities.hasStreams, laps: sql<boolean>`${activities.splitsMetricJson} is not null`, averageHr: activities.averageHr })
    .from(activities)
    .where(own(activities, eq(activities.id, id)))
    .limit(1)
  if (!a) return null
  const cols = [activityStreams.timeJson, activityStreams.distanceJson, activityStreams.movingJson, activityStreams.speedJson, activityStreams.altitudeJson, activityStreams.heartrateJson, activityStreams.cadenceJson, activityStreams.temperatureJson, activityStreams.latlngJson]
  const [st] = a.hasStreams
    ? await db
      .select({ channels: sql<number>`(${sql.join(cols.map((c) => sql`(${c} is not null)::int`), sql` + `)})`, hr: sql<boolean>`${activityStreams.heartrateJson} is not null` })
      .from(activityStreams)
      .where(own(activityStreams, eq(activityStreams.activityId, id)))
      .limit(1)
    : []
  // Not yet enriched from a source that fetches detail: that detail is still coming.
  const coming = !a.hasDetailedData && fetchesDetail(a.source)
  return {
    detail: !!st?.channels || !!a.laps || coming,
    channels: coming ? null : Number(st?.channels ?? 0),
    hr: a.averageHr != null || !!st?.hr,
  }
}

// The richer record takes over the row (same id): source, source id and summary from the new record; the old detail
// data goes. The runner's own input stays: run type override, RPE, notes, description and the run feedback (stored
// by activity id). Metrics are recomputed here unless the caller stores detail next (storeDetail recomputes them).
async function replaceActivity(id: string, row: ActivityRow, recompute: boolean) {
  const { id: _id, ...set } = row
  await db.delete(activityStreams).where(own(activityStreams, eq(activityStreams.activityId, id)))
  await db
    .update(activities)
    .set({ ...set, splitsMetricJson: null, bestEffortsJson: null, summaryPolyline: null, hasDetailedData: false, hasStreams: false, syncedAt: Math.floor(Date.now() / 1000) })
    .where(own(activities, eq(activities.id, id)))
  if (recompute && RUN_ACTIVITY_TYPES.includes(row.type)) await storeRunMetrics(id)
}

const json = (v: unknown) => (v ? JSON.stringify(v) : null)

// Laps and streams for one stored activity, then its run metrics. Splits, streams and metrics are run data: a
// cross-training row is never enriched (returns false).
// Not atomic with the row itself: the app has no transaction that works on both drivers (Neon HTTP has none that
// spans reads; lib/db/index.ts). So the writes are ordered instead: `hasDetailedData` is set last, after streams and
// metrics. A failure at any step leaves the row marked as lacking detail, and every step may run again (the streams
// are upserted): the next sync of a pull source (sync.ts missingDetail) or importing the file again (upsertSummary:
// `incomplete`) completes it.
export async function storeDetail(activityId: string, detail: ActivityDetail, plan?: PlanSession[]): Promise<boolean> {
  const [row] = await db.select({ type: activities.type }).from(activities).where(own(activities, eq(activities.id, activityId))).limit(1)
  if (!row) throw new Error(`Activity ${activityId} not in DB`)
  if (!RUN_ACTIVITY_TYPES.includes(row.type)) return false

  const st = detail.streams
  if (st) {
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
      .values(mine({ activityId, ...values }))
      .onConflictDoUpdate({ target: [activityStreams.userId, activityStreams.activityId], set: values })
  }
  await storeRunMetrics(activityId, plan)
  await db
    .update(activities)
    .set({ splitsMetricJson: detail.laps.length ? JSON.stringify(detail.laps) : null, hasDetailedData: true, hasStreams: !!st })
    .where(own(activities, eq(activities.id, activityId)))
  return true
}
