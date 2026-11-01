// Garmin Connect's JSON (activity list, splits, chart data) → the normalised shapes of lib/sources/types.ts. Pure.
import type { ActivitySummary, DetailStreams, Lap } from '@/lib/sources/types'

// ─── Types (subset — narrowed by usage) ───────────────────────────────────────

export interface GarminListActivity {
  activityId: number
  activityName: string
  activityType: { typeKey: string; parentTypeId: number }
  startTimeLocal: string           // "2026-06-30 07:12:34"
  startTimeGMT: string             // "2026-06-30 05:12:34"
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

export interface GarminSplit {
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

export interface GarminActivityDetailsResponse {
  activityId: number
  measurementCount: number
  metricsCount: number
  metricDescriptors: GarminChartMetric[]
  activityDetailMetrics: { metrics: (number | null)[] }[]
  geoPolylineDTO?: { polyline: { lat: number; lon: number }[] }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

const iso = (t: string) => t.trim().replace(' ', 'T').slice(0, 19)

export function toSummary(a: GarminListActivity): ActivitySummary {
  return {
    sourceActivityId: String(a.activityId),
    startUtc: a.startTimeGMT ? `${iso(a.startTimeGMT)}Z` : null,
    startLocal: iso(a.startTimeLocal),
    sport: a.activityType.typeKey,
    name: a.activityName || null,
    distanceM: a.distance ?? 0,
    movingS: Math.round(a.movingDuration ?? a.duration ?? 0),
    elapsedS: Math.round(a.duration ?? a.movingDuration ?? 0),
    elevationGainM: a.elevationGain ?? null,
    avgSpeedMs: a.averageSpeed ?? null,
    maxSpeedMs: a.maxSpeed ?? null,
    avgHr: a.averageHR ?? null,
    maxHr: a.maxHR ?? null,
    avgCadenceSpm: a.averageRunningCadenceInStepsPerMinute ?? null,
    calories: a.calories ?? null,
    startLat: a.startLatitude ?? null,
    startLng: a.startLongitude ?? null,
  }
}

export function toLaps(splits: GarminSplit[]): Lap[] {
  return splits.map((s) => ({
    distanceM: s.distance ?? 0,
    durationS: s.duration ?? 0,
    elevationGainM: s.elevationGain ?? null,
    avgSpeedMs: s.averageSpeed ?? null,
    avgHr: s.averageHR ?? null,
  }))
}

// Garmin's per-sample chart data → aligned series. Every series has one entry per sample
// (null where Garmin recorded nothing), so index i means the same moment in all of them.
export function parseDetailStreams(chart: GarminActivityDetailsResponse): DetailStreams {
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
