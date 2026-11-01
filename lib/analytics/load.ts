// Training load: TRIMP per day, CTL/ATL/TSB (fitness, fatigue, form) and ACWR. One model for the
// Fitness & Form chart, the Rennbereitschaft card and the plan engine.
import { addDays, eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import type { activities } from '@/lib/db/schema'
import { HR_MAX, HR_REST } from './hr'
import { CROSS_SPORTS, isCrossType, type Sport } from './cross-training'

// `type` and `perceivedExertion` are what cross-training (08-01) adds; rows without them count as runs.
type Row = Pick<typeof activities.$inferSelect, 'date' | 'durationS' | 'averageHr' | 'sufferScore'> & { type?: string | null; perceivedExertion?: number | null }

// Karvonen with the shared HR model (lib/analytics/hr.ts)
const K_CTL = 1 - Math.exp(-1 / 42)
const K_ATL = 1 - Math.exp(-1 / 7)

// Cross-training (research cross-training.md): session-RPE = minutes × RPE × SRPE_TO_TRIMP, in TRIMP units — an easy
// hour at RPE 5 ≈ 60 TRIMP, which is what easy runs typically measure (about 1 TRIMP/min). RPE 6 when none was tapped.
// Cycling and gym cardio count by HR like a run (factor 1: no validated discount). Nothing counts before
// CROSS_LOAD_FROM (a cut-off for installs whose older blocks were planned without cross-training; default: none).
export const SRPE_TO_TRIMP = 0.2
export const DEFAULT_RPE = 6
export const BIKE_LOAD_FACTOR = 1
export const CROSS_LOAD_FROM = '2000-01-01'

export function trimp(durationS: number, avgHr: number): number {
  const mins = durationS / 60
  const hrr = Math.min(1, Math.max(0, (avgHr - HR_REST) / (HR_MAX - HR_REST)))
  return mins * hrr * 0.64 * Math.exp(1.92 * hrr)
}

export const srpeLoad = (durationS: number, rpe: number | null | undefined) => (durationS / 60) * (rpe ?? DEFAULT_RPE) * SRPE_TO_TRIMP

const hrLoad = (a: Row) => (a.averageHr && a.averageHr > HR_REST ? trimp(a.durationS, a.averageHr) : 0)

// The sport a row counts for: runs (and rows without a type) → 'run'.
export const sportOfRow = (type: string | null | undefined): Sport => (isCrossType(type) ? CROSS_SPORTS[type].sport : 'run')

// Load of one activity: runs by TRIMP from average HR, else Strava's suffer score as a rough stand-in;
// cross-training per sport (see above), 0 before CROSS_LOAD_FROM.
export function activityLoad(a: Row): number {
  if (!a.date || !a.durationS) return 0
  if (isCrossType(a.type)) {
    if (a.date < CROSS_LOAD_FROM) return 0
    const mode = CROSS_SPORTS[a.type].load
    if (mode === 'hr') { const hr = hrLoad(a); return hr > 0 ? hr * BIKE_LOAD_FACTOR : srpeLoad(a.durationS, a.perceivedExertion) }
    return srpeLoad(a.durationS, a.perceivedExertion)
  }
  const hr = hrLoad(a)
  return hr > 0 ? hr : a.sufferScore ? a.sufferScore * 0.4 : 0
}

// Load per date, all sports together.
export function dailyLoads(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const a of rows) {
    const load = activityLoad(a)
    if (load > 0) out[a.date] = (out[a.date] ?? 0) + load
  }
  return out
}

// Load per date and sport (Analyse: Belastung nach Sport).
export function dailyLoadsBySport(rows: Row[]): Record<string, Partial<Record<Sport, number>>> {
  const out: Record<string, Partial<Record<Sport, number>>> = {}
  for (const a of rows) {
    const load = activityLoad(a)
    if (load <= 0) continue
    const sport = sportOfRow(a.type)
    const day = (out[a.date] ??= {})
    day[sport] = (day[sport] ?? 0) + load
  }
  return out
}

export interface FitnessPoint { date: string; load: number; ctl: number; atl: number; tsb: number }

// Every day from the first load up to `end`. TSB is the form at the start of the day
// (yesterday's CTL − ATL). Values rounded to 0.1.
export function fitnessSeries(rows: Row[], end: Date): FitnessPoint[] {
  const loads = dailyLoads(rows)
  const dates = Object.keys(loads).sort()
  if (!dates.length) return []
  let ctl = 0, atl = 0
  const r1 = (n: number) => Math.round(n * 10) / 10
  return eachDayOfInterval({ start: parseISO(dates[0]), end }).map((day) => {
    const date = format(day, 'yyyy-MM-dd')
    const load = loads[date] ?? 0
    const tsb = ctl - atl
    ctl = ctl + K_CTL * (load - ctl)
    atl = atl + K_ATL * (load - atl)
    return { date, load: r1(load), ctl: r1(ctl), atl: r1(atl), tsb: r1(tsb) }
  })
}

// Acute:chronic workload by distance: km of the last 7 days vs. the weekly average of the last 28 (both including today:
// today − 6 … today and today − 27 … today; before 2026-10-26 the windows were 8 and 29 days, ≈ 10 % too high).
export function acwr(runs: { date: string; distanceM: number }[], now: Date) {
  const since28d = format(subDays(now, 27), 'yyyy-MM-dd')
  const since7d = format(subDays(now, 6), 'yyyy-MM-dd')
  const recent = runs.filter((r) => r.date >= since28d)
  const acuteKm = recent.filter((r) => r.date >= since7d).reduce((s, r) => s + r.distanceM / 1000, 0)
  const chronicKm = recent.reduce((s, r) => s + r.distanceM / 1000, 0) / 4
  return { acwr: chronicKm > 0 ? acuteKm / chronicKm : 0, acuteKm, chronicKm }
}

// ACWR of today and the n − 1 days before it (today first), null when there are no chronic km (07-23: the red zone needs
// ACWR above its threshold on several days in a row).
export function acwrSeries(runs: { date: string; distanceM: number }[], now: Date, n = 3): (number | null)[] {
  return Array.from({ length: n }, (_, i) => {
    const day = subDays(now, i)
    const until = format(day, 'yyyy-MM-dd')
    const r = acwr(runs.filter((x) => x.date <= until), day)      // acwr() has no upper bound: later runs stay out
    return r.chronicKm > 0 ? r.acwr : null
  })
}

// Continue a CTL/ATL series with estimated future loads and return the form (TSB) at the start
// of `until`. `start` is the latest point (CTL/ATL after its day's load); `loads` holds the
// estimated load per future date. `addToStart` is load still to come on the start day itself.
export function projectForm(start: { date: string; ctl: number; atl: number }, loads: Map<string, number>, until: string, addToStart = 0) {
  let ctl = start.ctl + K_CTL * addToStart
  let atl = start.atl + K_ATL * addToStart
  for (let d = addDays(parseISO(start.date), 1); format(d, 'yyyy-MM-dd') <= until; d = addDays(d, 1)) {
    const date = format(d, 'yyyy-MM-dd')
    if (date === until) break
    const load = loads.get(date) ?? 0
    ctl = ctl + K_CTL * (load - ctl)
    atl = atl + K_ATL * (load - atl)
  }
  return Math.round((ctl - atl) * 10) / 10
}
