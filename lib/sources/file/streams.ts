// From the samples of an activity file to the normalised shapes: aligned streams (downsampled like Garmin's chart
// data), and the totals a file may lack (distance from positions, moving time, climb). Pure.
import type { ActivitySummary, DetailStreams } from '@/lib/sources/types'

export interface Sample {
  t: number                // epoch ms
  lat?: number | null
  lng?: number | null
  ele?: number | null
  hr?: number | null
  cadence?: number | null  // steps per minute
  dist?: number | null     // cumulative metres, when the file has it
  speed?: number | null    // m/s, when the file has it
  temp?: number | null
}

// Garmin's chart data has at most 1 000 samples (lib/sources/garmin-login/index.ts); files are stored the same way.
export const MAX_SAMPLES = 1000
// A gap longer than this between two samples is a pause (auto-pause stops recording).
const PAUSE_GAP_S = 30
// Slower than this (≈ 33 min/km) counts as standing.
const MOVING_SPEED = 0.5

const R = 6_371_000
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

const num = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v)

// Every sample with a cumulative distance (the file's own where it has one, else from positions), a speed and a
// cumulative moving time.
export function complete(raw: Sample[]) {
  const s = raw.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t)
  const hasDist = s.filter((p) => num(p.dist) != null).length >= s.length / 2
  const hasPos = s.some((p) => num(p.lat) != null && num(p.lng) != null)
  const dist: (number | null)[] = []
  let d = 0
  for (let i = 0; i < s.length; i++) {
    const p = s[i]
    if (hasDist) {
      d = num(p.dist) ?? d
    } else if (i > 0) {
      const q = s[i - 1]
      if (num(p.lat) != null && num(p.lng) != null && num(q.lat) != null && num(q.lng) != null) d += haversine(q.lat!, q.lng!, p.lat!, p.lng!)
    }
    dist.push(hasDist || hasPos ? d : null)
  }
  const speed: (number | null)[] = []
  const moving: number[] = []
  let mv = 0
  for (let i = 0; i < s.length; i++) {
    const dt = i > 0 ? (s[i].t - s[i - 1].t) / 1000 : 0
    // Speed over the last ~5 samples when the file has none.
    const j = Math.max(0, i - 5)
    const derived = dist[i] != null && dist[j] != null && s[i].t > s[j].t ? (dist[i]! - dist[j]!) / ((s[i].t - s[j].t) / 1000) : null
    const v = num(s[i].speed) ?? derived
    speed.push(v)
    const segment = i > 0 && dist[i] != null && dist[i - 1] != null && dt > 0 ? (dist[i]! - dist[i - 1]!) / dt : v
    if (i > 0 && dt <= PAUSE_GAP_S && (dist[i] == null || (segment ?? 0) >= MOVING_SPEED)) mv += dt
    moving.push(mv)
  }
  return { s, dist, speed, moving }
}

// Every k-th sample (always the last), so a long run keeps its shape at ≤ MAX_SAMPLES points.
export function downsampleIndex(n: number, max = MAX_SAMPLES): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i)
  const step = (n - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => Math.round(i * step))
}

const series = (xs: (number | null | undefined)[]) => {
  const out = xs.map((x) => num(x))
  return out.some((v) => v != null) ? out : null
}

export function buildStreams(raw: Sample[]): DetailStreams | null {
  const { s, dist, speed, moving } = complete(raw)
  if (s.length < 2) return null
  const idx = downsampleIndex(s.length)
  const pick = <T>(xs: T[]) => idx.map((i) => xs[i])
  const ps = pick(s)
  const latlng = ps.map((p) => (num(p.lat) != null && num(p.lng) != null ? [p.lat!, p.lng!] as [number, number] : null))
  return {
    time: ps.map((p) => p.t),
    distance: series(pick(dist)),
    moving: pick(moving),
    speed: series(pick(speed)),
    altitude: series(ps.map((p) => p.ele)),
    heartrate: series(ps.map((p) => p.hr)),
    cadence: series(ps.map((p) => p.cadence)),
    temperature: series(ps.map((p) => p.temp)),
    latlng: latlng.some(Boolean) ? latlng : null,
  }
}

// Climb with a 2 m dead band, so GPS/barometer noise does not add up.
export function elevationGain(ele: (number | null | undefined)[]): number | null {
  const xs = ele.map(num).filter((v): v is number => v != null)
  if (xs.length < 2) return null
  let gain = 0, ref = xs[0]
  for (const v of xs) {
    if (v > ref + 2) { gain += v - ref; ref = v } else if (v < ref - 2) ref = v
  }
  return Math.round(gain)
}

const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.map(num).filter((x): x is number => x != null && x > 0)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}
const max = (xs: (number | null | undefined)[]) => {
  const v = xs.map(num).filter((x): x is number => x != null)
  return v.length ? Math.max(...v) : null
}

// 'YYYY-MM-DDTHH:MM:SS' wall time of `ms` in a time zone, or at a fixed offset (FIT local_timestamp).
export function localWallTime(ms: number, tz: { zone?: string; offsetS?: number }): string {
  if (tz.offsetS != null) return new Date(ms + tz.offsetS * 1000).toISOString().slice(0, 19)
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: tz.zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
  return parts.replace(' ', 'T')
}

// Summary from the samples, with whatever totals the file states itself taking precedence.
export function summarise(
  raw: Sample[],
  base: { sourceActivityId: string; sport: string; name: string | null; tz: { zone?: string; offsetS?: number } },
  stated: Partial<Pick<ActivitySummary, 'distanceM' | 'movingS' | 'elapsedS' | 'elevationGainM' | 'avgSpeedMs' | 'maxSpeedMs' | 'avgHr' | 'maxHr' | 'avgCadenceSpm' | 'calories'>> & { startMs?: number } = {},
): ActivitySummary | null {
  const { s, dist, speed, moving } = complete(raw)
  const startMs = stated.startMs ?? s[0]?.t
  if (startMs == null || !Number.isFinite(startMs)) return null
  const lastT = s.length ? s[s.length - 1].t : startMs
  const distanceM = stated.distanceM ?? (dist.length ? dist[dist.length - 1] ?? 0 : 0)
  const movingS = Math.round(stated.movingS ?? (moving.length ? moving[moving.length - 1] : 0))
  const elapsedS = Math.round(stated.elapsedS ?? (lastT - startMs) / 1000)
  const first = s.find((p) => num(p.lat) != null && num(p.lng) != null)
  const pick = <T>(a: T | null | undefined, b: T | null) => (a ?? b)
  return {
    sourceActivityId: base.sourceActivityId,
    startUtc: new Date(startMs).toISOString().replace('.000Z', 'Z'),
    startLocal: localWallTime(startMs, base.tz),
    sport: base.sport,
    name: base.name,
    distanceM: Math.round(distanceM * 10) / 10,
    movingS: movingS || elapsedS,
    elapsedS,
    elevationGainM: pick(stated.elevationGainM, elevationGain(s.map((p) => p.ele))),
    avgSpeedMs: pick(stated.avgSpeedMs, movingS > 0 && distanceM > 0 ? distanceM / movingS : null),
    maxSpeedMs: pick(stated.maxSpeedMs, max(speed)),
    avgHr: pick(stated.avgHr, mean(s.map((p) => p.hr)) != null ? Math.round(mean(s.map((p) => p.hr))!) : null),
    maxHr: pick(stated.maxHr, max(s.map((p) => p.hr))),
    avgCadenceSpm: pick(stated.avgCadenceSpm, mean(s.map((p) => p.cadence)) != null ? Math.round(mean(s.map((p) => p.cadence))!) : null),
    calories: stated.calories ?? null,
    startLat: first?.lat ?? null,
    startLng: first?.lng ?? null,
  }
}
