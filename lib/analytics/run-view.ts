// Shared shaping of stored runs for the Läufe and Analyse pages.
import type { activities } from '@/lib/db/schema'
import { RUN_TYPES, type RunMetrics, type RunType } from './run-metrics'

export const RUN_ACTIVITY_TYPES = ['Run', 'TrailRun', 'VirtualRun']

type Row = typeof activities.$inferSelect

export function parseMetrics(row: Pick<Row, 'metricsJson'>): RunMetrics | null {
  if (!row.metricsJson) return null
  try { return JSON.parse(row.metricsJson) } catch { return null }
}

// The type shown everywhere: your manual correction wins over detection.
export function effectiveType(row: Pick<Row, 'runTypeOverride'>, m: RunMetrics | null): RunType {
  const o = row.runTypeOverride as RunType | null
  if (o && RUN_TYPES.includes(o)) return o
  return m?.runType ?? 'Locker'
}

export function runSummary(row: Row) {
  const m = parseMetrics(row)
  const km = row.distanceM / 1000
  const movingS = m?.movingS ?? row.durationS
  return {
    id: row.id,
    date: row.date,
    startTime: row.startTime,
    name: row.name,
    km: Math.round(km * 100) / 100,
    movingS,
    paceS: km > 0 ? Math.round(movingS / km) : null,
    hr: row.averageHr,
    maxHr: row.maxHr,
    cadence: row.avgCadence,
    elevationM: row.elevationM != null ? Math.round(row.elevationM) : null,
    runType: effectiveType(row, m),
    runTypeSource: row.runTypeOverride ? ('manual' as const) : (m?.runTypeSource ?? 'auto'),
    effMpb: m?.effMpb ?? null,
    hasMetrics: !!m,
  }
}

export type RunSummary = ReturnType<typeof runSummary>

// A run as the plan pairing (lib/plan/pace-check.ts) sees it: per full km split pace and HR.
export function toDatedRun(row: Row) {
  const m = parseMetrics(row)
  const full = (m?.splits ?? []).filter((s) => s.distM >= 950)
  return {
    id: row.id,
    date: row.date,
    km: Math.round(row.distanceM / 100) / 10,
    paceS: row.averagePaceSPerKm,
    avgHr: row.averageHr,
    splitPacesS: full.map((s) => s.paceS),
    splitHrs: full.map((s) => s.hr),
    zonesS: m?.zonesS ?? null,
  }
}
