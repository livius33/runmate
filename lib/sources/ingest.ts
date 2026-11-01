// The only writer of activities that come from a source (lib/sources/types.ts): normalised summary → row, the same
// source id → update, the same activity from another source → skipped, details → streams + laps + run metrics.
import { randomUUID } from 'crypto'
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities, activityStreams } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { storeRunMetrics } from '@/lib/analytics/store-metrics'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import type { PlanSession } from '@/lib/plan/types'
import { isDuplicate, START_TOLERANCE_S } from './dedupe'
import { typeForDb } from './sports'
import type { ActivityDetail, ActivitySummary, SourceId } from './types'

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

export type UpsertResult = { result: 'inserted' | 'updated' | 'duplicate'; id: string }

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
// `existing: 'skip'` (a file imported again) leave it and report a duplicate.
export async function upsertSummary(source: SourceId, summary: ActivitySummary, opts: { existing?: 'update' | 'skip' } = {}): Promise<UpsertResult> {
  const row = toActivityRow(source, summary)
  const [existing] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(own(activities, eq(activities.source, source), eq(activities.sourceActivityId, summary.sourceActivityId)))
    .limit(1)
  if (existing && opts.existing === 'skip') return { result: 'duplicate', id: existing.id }
  if (existing) {
    const { id: _id, source: _s, sourceActivityId: _sid, ...set } = row
    await db.update(activities).set(set).where(own(activities, eq(activities.id, existing.id)))
    return { result: 'updated', id: existing.id }
  }
  const dup = await findDuplicate(row)
  if (dup) return { result: 'duplicate', id: dup }
  await db.insert(activities).values(mine(row))
  return { result: 'inserted', id: row.id }
}

const json = (v: unknown) => (v ? JSON.stringify(v) : null)

// Laps and streams for one stored activity, then its run metrics. Splits, streams and metrics are run data: a
// cross-training row is never enriched (returns false).
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
  await db
    .update(activities)
    .set({ splitsMetricJson: detail.laps.length ? JSON.stringify(detail.laps) : null, hasDetailedData: true, hasStreams: !!st })
    .where(own(activities, eq(activities.id, activityId)))
  await storeRunMetrics(activityId, plan)
  return true
}
