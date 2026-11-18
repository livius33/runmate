// Generator inputs measured from the runner's runs and the current plan (07-06), so a draft starts from real numbers instead
// of typed-in placeholders. Rules: methodologies/research/peak-and-recovery.md 1.3 (B, P), long-run.md 2.2 (longest run
// of the last 30 days), paces.md 1.2 (recent race ≤ 6 months). Pure.
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'
import type { Distance } from '../methodology/schema'
import type { PlanSession, PlanWeek } from '../types'
import { RACE_KM, predictTimeS } from './paces'

export interface RunRow { date: string; distanceM: number; durationS: number; workoutType?: number | null; sportType?: string | null }
export interface MeasureInput {
  runs: RunRow[]
  plan: PlanSession[]               // effective plan (blocks + edits)
  weeks: PlanWeek[]                 // plan weeks (recovery flag)
  today: string
  start: string                     // plan start (any day; its Monday counts)
  distance: Distance                // goal distance (recent-race prediction)
}
export interface MeasuredInputs {
  currentKm: number
  currentKmSource: 'mean4' | 'recoveryBlock' | 'plan' | 'runs2' | 'return'   // runs2, return: a rebuild (lib/plan/rebuild.ts)
  provenKm: number
  longest30Km: number
  longest12mKm: number
  recentRace: { distanceKm: number; timeS: number; date: string } | null
}

const PROVEN_WEEKS = 52             // a race older than a year does not count
const MEAN_WEEKS = 4
const SPIKE_DAYS = 30
const RACE_MONTHS_DAYS = 183
const RACE_DISTANCE_TOLERANCE = 0.03
const STANDARD_KM = [5, 10, RACE_KM.half, RACE_KM.marathon]

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const monday = (d: string) => ymd(startOfWeek(parseISO(d), { weekStartsOn: 1 }))
const plus = (d: string, n: number) => ymd(addDays(parseISO(d), n))
const r1 = (n: number) => Math.round(n * 10) / 10
const isRace = (r: RunRow) => r.workoutType === 1 || r.sportType === 'Race'
const planKm = (s: PlanSession) => (s.type === 'rest' || s.type === 'race' ? 0 : s.km ?? 0)

export function measureInputs(input: MeasureInput): MeasuredInputs {
  const { runs, plan, today } = input
  const start = monday(input.start)
  const weekKm = (from: string) => runs.filter((r) => r.date >= from && r.date < plus(from, 7)).reduce((t, r) => t + r.distanceM / 1000, 0)

  // B: the planned week before a future start (its own source when that week is a recovery week), else the mean of the
  // last 4 completed weeks of runs.
  let currentKm = 0
  let currentKmSource: MeasuredInputs['currentKmSource'] = 'mean4'
  const before = plus(start, -7)
  const planned = plan.filter((s) => s.date >= before && s.date < start).reduce((t, s) => t + planKm(s), 0)
  if (start > today && planned > 0) {
    currentKm = planned
    currentKmSource = input.weeks.find((w) => w.start === before)?.recovery ? 'recoveryBlock' : 'plan'
  } else {
    const last = start > monday(today) ? monday(today) : start
    const ks = Array.from({ length: MEAN_WEEKS }, (_, i) => weekKm(plus(last, -7 * (i + 1))))
    currentKm = ks.reduce((a, b) => a + b, 0) / MEAN_WEEKS
  }

  // P: highest 4-week rolling mean of run km in the 52 weeks before min(start, today).
  const ref = start < monday(today) ? start : monday(today)
  const weekly = Array.from({ length: PROVEN_WEEKS }, (_, i) => weekKm(plus(ref, -7 * (PROVEN_WEEKS - i))))
  let provenKm = 0
  for (let i = MEAN_WEEKS - 1; i < weekly.length; i++) provenKm = Math.max(provenKm, weekly.slice(i - MEAN_WEEKS + 1, i + 1).reduce((a, b) => a + b, 0) / MEAN_WEEKS)

  // Longest run of the 30 days before the start: runs before today, planned runs from today; races do not count
  // (a marathon is not a training long run). The 12-month longest counts races.
  const from30 = plus(start, -SPIKE_DAYS)
  const actual30 = runs.filter((r) => r.date >= from30 && r.date < start && r.date < today && !isRace(r)).map((r) => r.distanceM / 1000)
  const planned30 = plan.filter((s) => s.date >= from30 && s.date < start && s.date >= today && s.type !== 'race' && !s.anchor).map(planKm)
  const longest30Km = Math.max(0, ...actual30, ...planned30)
  const longest12mKm = Math.max(0, ...runs.filter((r) => r.date >= plus(today, -365) && r.date < today).map((r) => r.distanceM / 1000))

  // Recent race: standard distance (± 3 %), last 6 months, best by its prediction for the goal distance.
  let recentRace: MeasuredInputs['recentRace'] = null
  let best = Infinity
  for (const r of runs) {
    if (!isRace(r) || r.date >= today || differenceInCalendarDays(parseISO(today), parseISO(r.date)) > RACE_MONTHS_DAYS) continue
    const km = STANDARD_KM.find((k) => Math.abs(r.distanceM / 1000 / k - 1) <= RACE_DISTANCE_TOLERANCE)
    if (km == null) continue
    const t = predictTimeS({ distanceKm: km, timeS: r.durationS }, input.distance)
    if (t < best) { best = t; recentRace = { distanceKm: r1(km), timeS: r.durationS, date: r.date } }
  }

  return {
    currentKm: r1(currentKm), currentKmSource, provenKm: r1(provenKm),
    longest30Km: r1(longest30Km), longest12mKm: r1(longest12mKm), recentRace,
  }
}
