import { db } from '@/lib/db'
import { activities, activityStreams } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { loadPlan } from '@/lib/plan/load'
import type { PlanSession } from '@/lib/plan/types'
import { matchSessionRuns } from '@/lib/plan/pace-check'
import { computeRunMetrics, type RunMetrics, type StreamSet } from './run-metrics'
import { RUN_ACTIVITY_TYPES, toDatedRun } from './run-view'

type Row = typeof activities.$inferSelect
const DAY_MS = 86_400_000

// The session this run stood in for: same pairing as the Plan page (sessions are often swapped
// with the day before or after). `metrics` gives this run's fresh splits for the pairing.
async function pairedSession(a: Row, metrics: RunMetrics, plan: PlanSession[]): Promise<PlanSession | null> {
  const near = plan.filter((s) => s.type !== 'rest' && Math.abs(Date.parse(s.date) - Date.parse(a.date)) <= DAY_MS)
  if (!near.length) return null
  const dates = [...new Set([...near.map((s) => s.date), a.date])]
  const rows = await db.select().from(activities).where(inArray(activities.date, dates))
  const runs = rows.filter((r) => RUN_ACTIVITY_TYPES.includes(r.type))
    .map((r) => toDatedRun(r.id === a.id ? { ...r, metricsJson: JSON.stringify(metrics) } : r))
  for (const [date, run] of matchSessionRuns(near, runs)) if (run?.id === a.id) return near.find((s) => s.date === date) ?? null
  return null
}

const parse = (json: string | null) => {
  if (!json) return null
  try { return JSON.parse(json) as (number | null)[] } catch { return null }
}

// Compute metrics for one stored run without saving. Pass `plan` when doing many runs at once.
export async function computeStoredRunMetrics(activityId: string, plan?: PlanSession[]): Promise<RunMetrics | null> {
  const [a] = await db.select().from(activities).where(eq(activities.id, activityId)).limit(1)
  if (!a) return null
  const [st] = await db.select().from(activityStreams).where(eq(activityStreams.activityId, activityId)).limit(1)

  const time = parse(st?.timeJson ?? null), distance = parse(st?.distanceJson ?? null)
  const streams: StreamSet | null = time && distance
    ? {
        time,
        distance,
        moving: parse(st!.movingJson) ?? time.map(() => null),
        hr: parse(st!.heartrateJson) ?? time.map(() => null),
        altitude: parse(st!.altitudeJson) ?? time.map(() => null),
        cadence: parse(st!.cadenceJson) ?? time.map(() => null),
      }
    : null

  const sessions = plan ?? (await loadPlan())
  const basics = {
    date: a.date,
    distanceM: a.distanceM,
    durationS: a.durationS,
    averageHr: a.averageHr,
    averagePaceSPerKm: a.averagePaceSPerKm,
    type: a.type,
    sportType: a.sportType,
  }
  // First pass with the same-day session; if the run actually stood in for a neighbouring
  // day's session, compute again with that one so the run type follows it.
  const sameDay = sessions.find((s) => s.date === a.date && s.type !== 'rest') ?? null
  let metrics = computeRunMetrics(streams, basics, sameDay)
  const paired = await pairedSession(a, metrics, sessions)
  if (paired && paired !== sameDay) metrics = computeRunMetrics(streams, basics, paired)
  return metrics
}

// Compute and save metrics_json for one run.
export async function storeRunMetrics(activityId: string, plan?: PlanSession[]): Promise<RunMetrics | null> {
  const metrics = await computeStoredRunMetrics(activityId, plan)
  if (metrics) await db.update(activities).set({ metricsJson: JSON.stringify(metrics) }).where(eq(activities.id, activityId))
  return metrics
}
