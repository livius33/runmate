// Per-run metrics computed once from Garmin's per-sample streams and stored in
// activities.metrics_json. Pure: no DB access, so it can be tested and re-run freely.
import { HR_ZONES, zoneIndex } from './hr'

export const METRICS_VERSION = 4   // 4: run type from the swap-aware paired session

export type RunType = 'Locker' | 'Tempo' | 'Intervalle' | 'Longrun' | 'Regeneration' | 'Laufband' | 'Rennen'
export const RUN_TYPES: RunType[] = ['Locker', 'Tempo', 'Intervalle', 'Longrun', 'Regeneration', 'Laufband', 'Rennen']

type Series = (number | null)[]

export interface StreamSet {
  time: Series       // epoch ms
  distance: Series   // cumulative metres
  moving: Series     // cumulative moving seconds (excludes pauses)
  hr: Series
  altitude: Series
  cadence: Series    // steps per minute
}

export interface RunBasics {
  date: string
  distanceM: number
  durationS: number
  averageHr: number | null
  averagePaceSPerKm: number | null
  type: string        // 'Run' | 'TrailRun' | 'VirtualRun'
  sportType: string | null
}

export interface PlannedSession { type: string; km?: number }

export interface Split { km: number; distM: number; movingS: number; paceS: number; hr: number | null; gainM: number; cadence: number | null }

export const BEST_EFFORTS = [
  { key: '1k', label: '1 km', m: 1000 },
  { key: '5k', label: '5 km', m: 5000 },
  { key: '10k', label: '10 km', m: 10000 },
  { key: 'hm', label: 'Halbmarathon', m: 21097.5 },
  { key: 'm', label: 'Marathon', m: 42195 },
] as const
export type BestKey = (typeof BEST_EFFORTS)[number]['key']

export interface RunMetrics {
  v: number
  movingS: number
  splits: Split[]
  best: Partial<Record<BestKey, number>>   // seconds for the fastest stretch of that distance
  zonesS: number[]                          // seconds in Z1..Z5
  decouplingPct: number | null              // HR drift, 2nd half vs 1st half
  effMpb: number | null                     // metres per heartbeat
  fastS: number                             // time faster than FAST_PACE_S
  fastBlocks: number
  runType: RunType
  runTypeSource: 'plan' | 'auto'
}

// "Fast" = quicker than 4:40/km, i.e. around race pace (4:23) or faster.
const FAST_PACE_S = 280
// Strides longer than this (over ~30 s) mean the GPS distance jumped. Real fast running
// reaches ~1.8 m; glitches between tall buildings show 2.5–4 m.
const MAX_STRIDE_M = 2.0
// Recovery jogs between intervals are slower than 5:30/km.
const RECOVERY_PACE_S = 330

export function computeRunMetrics(s: StreamSet | null, run: RunBasics, planned?: PlannedSession | null): RunMetrics {
  const base = s ? fromStreams(s) : null
  const movingS = base?.movingS ?? run.durationS
  const km = run.distanceM / 1000
  const effMpb = run.averageHr && movingS > 0 ? Math.round(((run.distanceM / (movingS / 60)) / run.averageHr) * 1000) / 1000 : null
  const fastS = base?.fastS ?? 0
  const fastBlocks = base?.fastBlocks ?? 0
  const { runType, runTypeSource } = classify(run, km, movingS, fastS, fastBlocks, base?.intervalBlocks ?? 0, planned)
  return {
    v: METRICS_VERSION,
    movingS: Math.round(movingS),
    splits: base?.splits ?? [],
    best: base?.best ?? {},
    zonesS: base?.zonesS ?? HR_ZONES.map(() => 0),
    decouplingPct: base?.decouplingPct ?? null,
    effMpb,
    fastS: Math.round(fastS),
    fastBlocks,
    runType,
    runTypeSource,
  }
}

// ─── Classification ───────────────────────────────────────────────────────────

const PLAN_TYPE: Record<string, RunType> = {
  easy: 'Locker', recovery: 'Regeneration', tempo: 'Tempo', intervals: 'Intervalle',
  speed: 'Intervalle', long: 'Longrun', race: 'Rennen',
}

function classify(run: RunBasics, km: number, movingS: number, fastS: number, fastBlocks: number, intervalBlocks: number, planned?: PlannedSession | null) {
  // The plan decides when the run roughly matches it (±40 % of the planned distance).
  // A planned quality session only counts if the run actually contained fast running.
  const mapped = planned ? PLAN_TYPE[planned.type] : undefined
  const quality = mapped === 'Tempo' || mapped === 'Intervalle' || mapped === 'Rennen'
  if (mapped && planned?.km && Math.abs(km - planned.km) <= planned.km * 0.4 && (!quality || fastS >= 3 * 60)) {
    return { runType: mapped, runTypeSource: 'plan' as const }
  }
  const treadmill = run.type === 'VirtualRun' || /treadmill|indoor/.test(run.sportType ?? '')
  const pace = run.averagePaceSPerKm ?? (km > 0 ? movingS / km : 0)
  let runType: RunType
  // Intervals: at least 3 short fast blocks (45 s – 8 min) that clearly outnumber long ones,
  // so a tempo run with 3 × 4 km or a long run with a few surges is not counted.
  const longBlocks = fastBlocks - intervalBlocks
  if (km >= 41) runType = 'Rennen'   // marathon distance: every one so far was a race
  else if (intervalBlocks >= 3 && intervalBlocks >= 2 * longBlocks) runType = 'Intervalle'
  else if (treadmill) runType = 'Laufband'
  // Long unless most of it was fast: 2 × 5 km @ race pace inside 18 km is a tempo session.
  else if ((km >= 18 || movingS >= 90 * 60) && fastS < movingS * 0.4) runType = 'Longrun'
  else if (fastS >= 15 * 60) runType = 'Tempo'
  else if (km < 8 && pace > 360) runType = 'Regeneration'
  else runType = 'Locker'
  return { runType, runTypeSource: 'auto' as const }
}

// ─── Stream analysis ──────────────────────────────────────────────────────────

interface Sample { t: number; d: number; mv: number; hr: number | null; alt: number | null; cad: number | null }

function samples(s: StreamSet): Sample[] {
  const out: Sample[] = []
  const n = s.distance.length
  for (let i = 0; i < n; i++) {
    const d = s.distance[i]
    const t = s.time[i]
    if (d == null || t == null) continue
    const prev = out[out.length - 1]
    // Moving time falls back to elapsed time when Garmin did not record it.
    const mv = s.moving[i] ?? (prev ? prev.mv + (t - prev.t) / 1000 : 0)
    if (prev && d < prev.d) continue   // distance must not go backwards
    out.push({ t, d, mv, hr: s.hr[i] ?? null, alt: s.altitude[i] ?? null, cad: s.cadence[i] ?? null })
  }
  return out
}

// Moving time at an exact distance, interpolated between samples.
function mvAt(p: Sample[], dist: number, from = 0) {
  let i = from
  while (i < p.length - 1 && p[i + 1].d < dist) i++
  const a = p[i], b = p[Math.min(i + 1, p.length - 1)]
  if (b.d === a.d) return { mv: a.mv, i }
  return { mv: a.mv + ((dist - a.d) / (b.d - a.d)) * (b.mv - a.mv), i }
}

function mean(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null && x > 0)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function gain(alts: (number | null)[]) {
  let g = 0, ref: number | null = null
  for (const a of alts) {
    if (a == null) continue
    if (ref == null) { ref = a; continue }
    if (a - ref >= 2) { g += a - ref; ref = a } else if (ref - a >= 2) ref = a
  }
  return Math.round(g)
}

function fromStreams(s: StreamSet) {
  const p = samples(s)
  if (p.length < 10) return null
  const total = p[p.length - 1].d
  const movingS = p[p.length - 1].mv - p[0].mv

  // km splits (last partial split kept when ≥ 100 m)
  const splits: Split[] = []
  let startD = 0, startMv = p[0].mv, startI = 0
  for (let k = 1; ; k++) {
    const endD = Math.min(k * 1000, total)
    if (endD <= startD || (endD === total && endD - startD < 100)) break
    const { mv, i } = mvAt(p, endD, startI)
    const seg = p.slice(startI, i + 2)
    const distM = endD - startD, sec = mv - startMv
    const hr = mean(seg.map((x) => x.hr)), cad = mean(seg.map((x) => x.cad))
    splits.push({
      km: k, distM: Math.round(distM), movingS: Math.round(sec), paceS: Math.round(sec / (distM / 1000)),
      hr: hr && Math.round(hr), gainM: gain(seg.map((x) => x.alt)), cadence: cad && Math.round(cad),
    })
    startD = endD; startMv = mv; startI = i
    if (endD >= total) break
  }

  // Fastest stretch of each distance (two pointers over the samples).
  // GPS glitches show up as impossible strides. Stride = distance ÷ steps over a ~30 s
  // window around each sample. A 1 km stretch must be free of such samples; 5 km and longer
  // may contain up to 1 %, so one outlier doesn't void a whole race. (Needs cadence.)
  const bad: number[] = [0]
  let w0 = 0
  for (let k = 1; k < p.length; k++) {
    while (w0 < k && p[k].mv - p[w0].mv > 30) w0++
    let stepsW = 0
    for (let q = w0 + 1; q <= k; q++) stepsW += ((p[q].cad ?? 0) * (p[q].mv - p[q - 1].mv)) / 60
    const implausible = stepsW > 20 && (p[k].d - p[w0].d) / stepsW > MAX_STRIDE_M
    bad.push(bad[k - 1] + (implausible ? 1 : 0))
  }
  const best: Partial<Record<BestKey, number>> = {}
  for (const e of BEST_EFFORTS) {
    if (total < e.m) continue
    let bestS = Infinity, i = 0
    for (let j = 0; j < p.length; j++) {
      if (p[j].d - p[0].d < e.m) continue
      const startDist = p[j].d - e.m
      while (i < j - 1 && p[i + 1].d <= startDist) i++
      if (bad[j] - bad[i] > (e.m >= 5000 ? Math.floor((j - i) * 0.01) : 0)) continue
      const { mv } = mvAt(p, startDist, i)
      bestS = Math.min(bestS, p[j].mv - mv)
    }
    if (Number.isFinite(bestS)) best[e.key] = Math.round(bestS)
  }

  // Time in zones, weighted by moving time between samples
  const zonesS = HR_ZONES.map(() => 0)
  for (let i = 1; i < p.length; i++) {
    const dt = p[i].mv - p[i - 1].mv
    const hr = p[i].hr
    if (hr == null || hr <= 0 || dt <= 0 || dt > 60) continue
    const z = zoneIndex(hr)
    if (z >= 0) zonesS[z] += dt
  }

  // HR drift: efficiency (speed per beat) of the 2nd half vs the 1st, by moving time.
  // Only meaningful for steady runs of 30+ minutes.
  let decouplingPct: number | null = null
  if (movingS >= 30 * 60) {
    const midMv = p[0].mv + movingS / 2
    const mid = p.findIndex((x) => x.mv >= midMv)
    const ef = (a: Sample[]) => {
      const hr = mean(a.map((x) => x.hr))
      const sec = a[a.length - 1].mv - a[0].mv
      return hr && sec > 0 ? (a[a.length - 1].d - a[0].d) / sec / hr : null
    }
    const e1 = ef(p.slice(0, mid + 1)), e2 = ef(p.slice(mid))
    if (e1 && e2) decouplingPct = Math.round((1 - e2 / e1) * 1000) / 10
  }

  // Fast running: pace over a rolling ~60 s window, grouped into blocks. A block only ends
  // after a real recovery (> 60 s slower than RECOVERY_PACE_S); steady running just above
  // the fast threshold (a tempo run drifting to 4:45) keeps the block going.
  let fastS = 0, fastBlocks = 0, intervalBlocks = 0
  let blockS = 0, gapS = 0, slowS = 0, j0 = 0
  const closeBlock = () => {
    if (blockS >= 45) { fastBlocks++; if (blockS <= 8 * 60) intervalBlocks++ }
    blockS = 0; gapS = 0; slowS = 0
  }
  for (let i = 1; i < p.length; i++) {
    while (j0 < i && p[i].mv - p[j0].mv > 60) j0++
    const w = p[i].mv - p[j0].mv, dist = p[i].d - p[j0].d
    const dt = p[i].mv - p[i - 1].mv
    const paceNow = w >= 20 && dist > 0 ? w / (dist / 1000) : Infinity
    if (paceNow <= FAST_PACE_S) { fastS += dt; blockS += dt + gapS; gapS = 0; slowS = 0 }
    else if (blockS > 0) {
      gapS += dt
      if (paceNow >= RECOVERY_PACE_S) slowS += dt
      if (slowS > 60) closeBlock()
    }
  }
  closeBlock()

  return { movingS, splits, best, zonesS: zonesS.map(Math.round), decouplingPct, fastS, fastBlocks, intervalBlocks }
}
