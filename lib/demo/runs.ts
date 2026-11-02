// Synthetic runs for the demo athlete (Phase 5): a planned session → one activity row with per-sample streams (GPS on
// a geometric loop around Hamburg's Außenalster, HR with a smooth response and drift, cadence, altitude), the laps
// per km and the run metrics. Pure and seeded: the same session, date and random stream give the same run.
import { addMinutes } from 'date-fns'
import type { activities, activityStreams } from '@/lib/db/schema'
import { computeRunMetrics } from '@/lib/analytics/run-metrics'
import { hrMax, hrRest } from '@/lib/analytics/hr'
import { paceToS, qualityKm } from '@/lib/plan/format'
import type { PlanSession } from '@/lib/plan/types'
import type { Lap } from '@/lib/sources/types'

export type DemoActivity = Omit<typeof activities.$inferSelect, 'userId'>
export type DemoStreams = Omit<typeof activityStreams.$inferSelect, 'userId'>

// ─── Seeded randomness (mulberry32, as in the plan simulator) ─────────────────

export type Rand = () => number
export function rng(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const between = (r: Rand, lo: number, hi: number) => lo + (hi - lo) * r()

// Local wall time in a time zone → the instant (two passes cover the DST switch).
function fromZonedTime(local: string, timeZone: string): Date {
  const wall = Date.parse(`${local}Z`)
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const offset = (ms: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms
  }
  const first = wall - offset(wall)
  return new Date(wall - offset(first))
}

// ─── Session → segments ──────────────────────────────────────────────────────

// Effort as a share of the heart-rate reserve (Karvonen); the run's HR settles towards it.
const EFFORT = { recovery: 0.48, easy: 0.53, long: 0.55, steady: 0.6, threshold: 0.82, interval: 0.88 } as const
type Effort = keyof typeof EFFORT
interface Segment { m: number; paceS: number; effort: Effort }

export interface Behaviour {
  kmFactor: number          // run km = planned × this
  paceDelta: number         // s/km against the target (negative = faster)
  effortDelta: number       // added to the HR-reserve share (a hard phase)
}
export const NORMAL: Behaviour = { kmFactor: 1, paceDelta: 0, effortDelta: 0 }

function segments(s: PlanSession, km: number, easyS: number, b: Behaviour): Segment[] {
  const easy = (m: number, effort: Effort = 'easy', delta = 0): Segment => ({ m, paceS: easyS + delta + b.paceDelta, effort })
  const q = s.pace ? Math.min(qualityKm(s), Math.max(0, km - 2)) : 0
  if ((s.type === 'tempo' || s.type === 'intervals') && s.pace && q > 0) {
    const fast = paceToS(s.pace) + Math.round(b.paceDelta / 2)
    if (s.type === 'intervals') {
      const reps = Math.max(2, Math.round(q))
      const jogs = (reps - 1) * 0.4
      const warm = Math.max(1, (km - reps - jogs) / 2)
      const out: Segment[] = [easy(warm * 1000)]
      for (let i = 0; i < reps; i++) {
        out.push({ m: 1000, paceS: fast, effort: 'interval' })
        if (i < reps - 1) out.push(easy(400, 'recovery', 75))
      }
      return [...out, easy(warm * 1000)]
    }
    const warm = Math.max(1, (km - q) / 2)
    return [easy(warm * 1000), { m: q * 1000, paceS: fast, effort: 'threshold' }, easy(warm * 1000)]
  }
  if (s.type === 'recovery') return [easy(km * 1000, 'recovery', 25)]
  if (s.type === 'long') return [easy(km * 1000, 'long', 5)]
  if (s.type === 'tempo' || s.type === 'intervals') return [easy(km * 1000, 'steady', -10)]   // hills, mid-long run
  return [easy(km * 1000)]
}

// ─── The Außenalster loop (geometric, ~6.6 km): position after `m` metres ──────

const CENTER = { lat: 53.5655, lng: 10.0065 }
const R_LAT_M = 1350, R_LNG_M = 520
const M_PER_DEG_LAT = 111_320
const M_PER_DEG_LNG = 111_320 * Math.cos((CENTER.lat * Math.PI) / 180)
const LOOP_M = 2 * Math.PI * Math.sqrt((R_LAT_M ** 2 + R_LNG_M ** 2) / 2)
function position(m: number, offset: number): [number, number] {
  const a = offset + (2 * Math.PI * m) / LOOP_M
  return [Math.round((CENTER.lat + (R_LAT_M * Math.cos(a)) / M_PER_DEG_LAT) * 1e6) / 1e6,
    Math.round((CENTER.lng + (R_LNG_M * Math.sin(a)) / M_PER_DEG_LNG) * 1e6) / 1e6]
}

// ─── One run ─────────────────────────────────────────────────────────────────

const MAX_SAMPLES = 400
const r1 = (n: number) => Math.round(n * 10) / 10

export interface DemoRun { activity: DemoActivity; streams: DemoStreams }

export interface RunInput {
  id: string
  date: string
  session: PlanSession          // what the athlete ran for (its title, type, km)
  km: number                    // planned km (before the behaviour factor)
  easyPaceS: number
  timeZone: string
  behaviour: Behaviour
  rand: Rand
  rpe?: number | null
}

export function makeRun(i: RunInput): DemoRun {
  const { rand, behaviour: b } = i
  const km = r1(i.km * b.kmFactor * between(rand, 0.98, 1.03))
  const segs = segments(i.session, km, i.easyPaceS + Math.round(between(rand, -6, 6)), b)
  const totalM = segs.reduce((t, s) => t + s.m, 0)
  const morning = rand() < 0.55
  const startLocal = `${i.date}T${morning ? '07' : '18'}:${String(Math.floor(between(rand, 0, 50))).padStart(2, '0')}:00`
  const start = fromZonedTime(startLocal, i.timeZone)
  const offset = between(rand, 0, 2 * Math.PI)

  // Integrate second by second; keep every `step`-th sample.
  const max = hrMax(), rest = hrRest()
  const seconds = Math.round(segs.reduce((t, s) => t + (s.m / 1000) * s.paceS, 0))
  const step = Math.max(5, Math.ceil(seconds / MAX_SAMPLES))
  const time: number[] = [], dist: number[] = [], moving: number[] = [], speed: number[] = [], alt: number[] = []
  const hr: number[] = [], cad: number[] = [], latlng: [number, number][] = []
  let m = 0, t = 0, h = rest + 35, seg = 0, inSeg = 0, maxSpeed = 0, gain = 0, lastAlt = 8
  while (m < totalM) {
    const s = segs[seg]
    const v = 1000 / (s.paceS * between(rand, 0.985, 1.015))
    const target = rest + Math.min(0.97, EFFORT[s.effort] + b.effortDelta + 0.03 * (t / 3600)) * (max - rest)
    h += (target - h) / 25 + between(rand, -0.4, 0.4)
    m += v; t += 1; inSeg += v
    if (inSeg >= s.m && seg < segs.length - 1) { seg++; inSeg = 0 }
    if (t % step === 0 || m >= totalM) {
      const a = 8 + 3 * Math.sin((2 * Math.PI * m) / LOOP_M + offset) + between(rand, -0.2, 0.2)
      if (a > lastAlt) gain += a - lastAlt
      lastAlt = a
      time.push(start.getTime() + t * 1000); dist.push(Math.round(Math.min(m, totalM) * 10) / 10); moving.push(t)
      speed.push(Math.round(v * 100) / 100); alt.push(r1(a)); hr.push(Math.round(h))
      cad.push(Math.round((v > 3.7 ? 182 : v > 3.2 ? 174 : 168) + between(rand, -2, 2)))
      latlng.push(position(m, offset))
      maxSpeed = Math.max(maxSpeed, v)
    }
  }
  const durationS = t
  const avgHr = Math.round(hr.reduce((x, y) => x + y, 0) / hr.length)
  const laps: Lap[] = []
  for (let k = 1, from = 0; k <= Math.ceil(totalM / 1000); k++) {
    const to = dist.findIndex((d) => d >= Math.min(k * 1000, totalM))
    if (to <= from) continue
    const lapHr = hr.slice(from + 1, to + 1)
    const dm = dist[to] - dist[from], ds = moving[to] - moving[from]
    laps.push({ distanceM: Math.round(dm), durationS: ds, elevationGainM: null, avgSpeedMs: Math.round((dm / ds) * 100) / 100,
      avgHr: lapHr.length ? Math.round(lapHr.reduce((x, y) => x + y, 0) / lapHr.length) : null })
    from = to
  }

  const isLong = i.session.type === 'long'
  const isWorkout = i.session.type === 'tempo' || i.session.type === 'intervals'
  const basics = {
    date: i.date, distanceM: Math.round(totalM), durationS, averageHr: avgHr, averagePaceSPerKm: Math.round(durationS / (totalM / 1000)),
    type: 'Run', sportType: 'Run',
  }
  const metrics = computeRunMetrics({ time, distance: dist, moving, hr, altitude: alt, cadence: cad }, basics, i.session)
  const startTime = startLocal.slice(11)
  const activity: DemoActivity = {
    id: i.id, source: 'file', sourceActivityId: i.id, startedAt: Math.floor(start.getTime() / 1000),
    type: 'Run', sportType: 'Run', workoutType: isLong ? 2 : isWorkout ? 3 : 0,
    name: `Hamburg – ${i.session.title}`, description: null,
    distanceM: basics.distanceM, durationS, elapsedTimeS: durationS + Math.round(between(rand, 10, 90)),
    elevationM: Math.round(gain), averageHr: avgHr, maxHr: Math.max(...hr), avgCadence: Math.round(cad.reduce((x, y) => x + y, 0) / cad.length),
    averagePaceSPerKm: basics.averagePaceSPerKm, averageSpeedMs: Math.round((totalM / durationS) * 100) / 100,
    maxSpeedMs: Math.round(maxSpeed * 100) / 100, calories: Math.round(totalM / 1000 * 62), sufferScore: null,
    perceivedExertion: i.rpe ?? null, prCount: null, kudosCount: null, achievementCount: null, gearId: null,
    startLat: latlng[0][0], startLng: latlng[0][1], startTime, summaryPolyline: null, bestEffortsJson: null,
    splitsMetricJson: JSON.stringify(laps), hasDetailedData: true, hasStreams: true, date: i.date, notes: null,
    metricsJson: JSON.stringify(metrics), runTypeOverride: null, syncedAt: Math.floor(addMinutes(start, 90).getTime() / 1000),
  }
  const streams: DemoStreams = {
    activityId: i.id, timeJson: JSON.stringify(time), distanceJson: JSON.stringify(dist), altitudeJson: JSON.stringify(alt),
    heartrateJson: JSON.stringify(hr), cadenceJson: JSON.stringify(cad), gradeJson: null, latlngJson: JSON.stringify(latlng),
    movingJson: JSON.stringify(moving), speedJson: JSON.stringify(speed), temperatureJson: null, fetchedAt: activity.syncedAt,
  }
  return { activity, streams }
}

// A run before the block (history for fitness and the generator's measured inputs): summary only, no streams.
export function historyRun(id: string, date: string, km: number, easyPaceS: number, timeZone: string, rand: Rand, steady = false): DemoActivity {
  const paceS = Math.round(easyPaceS + (steady ? -35 : 0) + between(rand, -8, 8))
  const durationS = Math.round(km * paceS)
  const start = fromZonedTime(`${date}T07:30:00`, timeZone)
  const averageHr = Math.round(hrRest() + ((steady ? EFFORT.steady + 0.08 : EFFORT.easy) + between(rand, -0.02, 0.02)) * (hrMax() - hrRest()))
  const basics = { date, distanceM: km * 1000, durationS, averageHr, averagePaceSPerKm: paceS, type: 'Run', sportType: 'Run' }
  return {
    id, source: 'file', sourceActivityId: id, startedAt: Math.floor(start.getTime() / 1000), type: 'Run', sportType: 'Run',
    workoutType: km >= 14 ? 2 : steady ? 3 : 0, name: km >= 14 ? 'Hamburg – Longrun' : steady ? 'Hamburg – Zügig' : 'Hamburg – Locker', description: null,
    distanceM: km * 1000, durationS, elapsedTimeS: durationS + 30, elevationM: 20, averageHr, maxHr: averageHr + 12, avgCadence: 170,
    averagePaceSPerKm: paceS, averageSpeedMs: Math.round((1000 / paceS) * 100) / 100, maxSpeedMs: null, calories: Math.round(km * 62),
    sufferScore: null, perceivedExertion: null, prCount: null, kudosCount: null, achievementCount: null, gearId: null,
    startLat: null, startLng: null, startTime: '07:30:00', summaryPolyline: null, bestEffortsJson: null, splitsMetricJson: null,
    hasDetailedData: false, hasStreams: false, date, notes: null, metricsJson: JSON.stringify(computeRunMetrics(null, basics, null)),
    runTypeOverride: null, syncedAt: Math.floor(start.getTime() / 1000) + 5400,
  }
}

// A cross-training session as the app stores a manual entry (lib/analytics/cross-training.ts): no distance, no streams.
export function crossSession(id: string, date: string, type: 'Strength' | 'Ride', minutes: number, rpe: number, name: string): DemoActivity {
  return {
    id, source: 'manual', sourceActivityId: null, startedAt: null, type, sportType: 'manual', workoutType: null, name, description: null,
    distanceM: 0, durationS: minutes * 60, elapsedTimeS: minutes * 60, elevationM: null, averageHr: null, maxHr: null, avgCadence: null,
    averagePaceSPerKm: null, averageSpeedMs: null, maxSpeedMs: null, calories: null, sufferScore: null, perceivedExertion: rpe,
    prCount: null, kudosCount: null, achievementCount: null, gearId: null, startLat: null, startLng: null, startTime: null,
    summaryPolyline: null, bestEffortsJson: null, splitsMetricJson: null, hasDetailedData: false, hasStreams: false, date,
    notes: null, metricsJson: null, runTypeOverride: null, syncedAt: 0,
  }
}
