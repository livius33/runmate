// Simulated athletes: one season over the example plan (examples/porto-2026), day by day. Each morning the engine runs on what is synced;
// every Sunday the first Plan anpassen suggestion for the next two weeks is applied; then the athlete runs (or not)
// by a behaviour model. Invariants are checked after every step. Seeded, so every season can be replayed.
import { getDay, parseISO } from 'date-fns'
import { EMPTY_ENGINE, runEngine, type EngineState, type Fitness } from '@/lib/plan/engine'
import { effectiveSessions, type Overrides } from '@/lib/plan/effective'
import type { Pause, PauseInput } from '@/lib/plan/pause'
import { PLAN_START, RECOVERY_END, SESSIONS } from '@/examples/porto-2026/plan'
import { type PlanSession } from '@/lib/plan/types'
import { weekOf } from '@/lib/plan/blocks'
import { applyChanges, periodFor, recentVolume, suggestions } from '@/lib/plan/workshop'
import { acwr, fitnessSeries } from '@/lib/analytics/load'
import type { DatedRun } from '@/lib/plan/pace-check'
import type { AthleteProfile, Weekday } from '@/lib/plan/athlete-profile'
import { actualOf, easyPaceS, makeRun, plus, sessionPaceS } from './arbitraries'
import { checkInvariants, engineLogged, formatViolation, type Violation } from './invariants'

// ─── Seeded randomness (mulberry32) ───────────────────────────────────────────

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

export interface Scenario {
  name: string
  label: string
  skip?: number                        // probability to skip a planned run
  kmFactor?: number                    // mean km factor of a run
  paceDelta?: number                   // s/km against the session's pace
  hrDelta?: number
  tsbBias?: number                     // added to the computed TSB (e.g. a hard life phase)
  off?: [string, string][]             // no runs (sick, holiday)
  syncFreeze?: [string, string]        // no sync on these days; afterwards everything arrives
  runDays?: Weekday[]                  // the athlete only runs on these weekdays
  profile?: Partial<AthleteProfile>
  markPause?: boolean                  // the athlete marks each 'off' range as Krank (open from its first day, closed when back)
}

const PROFILE: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: 175, experience: 'advanced', weeklyKm: 90,
  availableDays: [1, 2, 3, 4, 5, 6, 7], longRunDay: 6, qualityDays: [2], kbDays: [2, 4], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: null, thresholdPaceS: null, fiveKS: null, savedAt: null,
}

export const SCENARIOS: Scenario[] = [
  { name: 'reliable', label: 'Zuverlässig' },
  { name: 'skip20', label: 'Lässt 20 % aus', skip: 0.2 },
  { name: 'sick-build', label: '10 Tage krank im Aufbau', off: [['2026-10-05', '2026-10-14']] },
  { name: 'sick-taper', label: 'Krank im Taper', off: [['2026-10-27', '2026-11-05']] },
  { name: 'more15', label: 'Läuft 15 % mehr', kmFactor: 1.15 },
  { name: 'fast', label: 'Läuft 15 s/km zu schnell (rote Form)', paceDelta: -15, hrDelta: 12, tsbBias: -18 },
  { name: 'late-sync', label: '9 Tage kein Sync', syncFreeze: ['2026-10-12', '2026-10-20'] },
  { name: 'holiday', label: 'Urlaubswoche, dann voll weiter', off: [['2026-10-12', '2026-10-18']] },
  { name: 'three-days', label: 'Nur 3 Lauftage (Profil)', runDays: [2, 4, 6], profile: { availableDays: [2, 4, 6] } },
  { name: 'long-on-rest', label: 'Longrun-Tag = Ruhetag (Profil)', profile: { availableDays: [1, 2, 3, 4, 5, 7], longRunDay: 6, restDay: 6 } },
]

// Krank/Pause (07-08): the off ranges marked by the athlete.
export const PAUSE_SCENARIOS: Scenario[] = [
  { name: 'sick-build-marked', label: '10 Tage krank im Aufbau, als Krank markiert', off: [['2026-10-05', '2026-10-14']], markPause: true },
  { name: 'sick-taper-marked', label: 'Krank im Taper, als Krank markiert', off: [['2026-10-27', '2026-11-05']], markPause: true },
]

// ─── Known findings (findings.test.ts): counted, not failed ──────────────────

// No open findings (F-01 … F-06 fixed in 07-11). A new finding gets a branch here returning its id while it is open.
function known(_v: Violation, _step: 'engine' | 'workshop', _ctx: { before: PlanSession[]; kind?: string; keys?: string[] }): string | null {
  return null
}

// ─── Simulation ───────────────────────────────────────────────────────────────

export interface DayLog { date: string; synced: string; fitness: Fitness; engine: string[]; workshop?: string; run?: string }
export interface SimResult {
  scenario: string; seed: number
  violations: { date: string; step: string; text: string }[]
  known: Record<string, number>
  errors: { date: string; message: string }[]
  metrics: {
    basePlanKm: number; finalPlanKm: number; runKm: number
    baseMaxWeekKm: number; maxWeekKm: number
    flipFlopDays: number; engineChanges: number; changesPerWeek: number
    missedKm: number; rebalancedKm: number; workshopApplied: number; redDays: number
  }
  log: DayLog[]
}

const inRange = (d: string, ranges?: [string, string][]) => !!ranges?.some(([a, b]) => d >= a && d <= b)
const planKm = (s?: PlanSession) => (s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)
const r1 = (n: number) => Math.round(n * 10) / 10

// Eight weeks of easy running before the plan, so CTL/ATL start from a trained state.
function history(): DatedRun[] {
  const out: DatedRun[] = []
  for (let i = 56; i >= 1; i--) {
    const d = plus(PLAN_START, -i)
    if (getDay(parseISO(d)) === 5) continue
    out.push(makeRun(d, getDay(parseISO(d)) === 6 ? 26 : 13, easyPaceS, 142, 0))
  }
  return out
}

function fitnessOn(runs: DatedRun[], through: string, bias: number): Fitness {
  const rows = runs.filter((r) => r.date <= through)
    .map((r) => ({ date: r.date, durationS: Math.round(r.km * (r.paceS ?? easyPaceS)), averageHr: r.avgHr, sufferScore: null }))
  const series = fitnessSeries(rows as never, parseISO(plus(through, 1)))
  const last = series[series.length - 1]
  const a = acwr(runs.filter((r) => r.date <= through).map((r) => ({ date: r.date, distanceM: r.km * 1000 })), parseISO(plus(through, 1)))
  return { tsb: last ? r1(last.tsb + bias) : null, acwr: Math.round(a.acwr * 100) / 100 }
}

// State handed to `onDay` after the morning engine run (before the athlete runs) — used by scripts/snapshot-plan.mts.
export interface DayState { date: string; manual: Overrides; state: EngineState; runs: DatedRun[]; synced: string; fitness: Fitness }

export function simulate(sc: Scenario, seed: number, opts: { verbose?: boolean; until?: string; onDay?: (s: DayState) => void } = {}): SimResult {
  const rand = rng(seed)
  const profile: AthleteProfile = { ...PROFILE, ...sc.profile }
  const runs: DatedRun[] = history()
  let manual: Overrides = {}
  let state: EngineState = EMPTY_ENGINE
  const violations: SimResult['violations'] = []
  const knownHits: Record<string, number> = {}
  const errors: SimResult['errors'] = []
  const log: DayLog[] = []
  const seen = new Map<string, string[]>()    // date → distinct versions of its session over the season
  let workshopApplied = 0, redDays = 0
  const events = [{ date: '2026-11-08', name: 'Porto Marathon' }, ...SESSIONS.filter((s) => s.anchor).map((s) => ({ date: s.date, name: s.title }))]

  const record = (step: string, list: Violation[], ctx: Parameters<typeof known>[2], date: string) => {
    for (const v of list) {
      const k = known(v, step as 'engine' | 'workshop', ctx)
      if (k) knownHits[k] = (knownHits[k] ?? 0) + 1
      else violations.push({ date, step, text: formatViolation(v) })
    }
  }

  for (let d = PLAN_START; d <= (opts.until ?? RECOVERY_END); d = plus(d, 1)) {
    const day: DayLog = { date: d, synced: '', fitness: { tsb: null, acwr: null }, engine: [] }
    const pauses: Pause[] = !sc.markPause ? [] : (sc.off ?? []).filter(([a]) => a <= d)
      .map(([a, b], i) => ({ id: `sim-${i}`, kind: 'krank' as const, from: a, to: d > b ? b : null }))
    const P: PauseInput = { pauses, today: d }
    try {
      // Morning: sync, form, engine.
      const frozen = sc.syncFreeze && d >= sc.syncFreeze[0] && d <= plus(sc.syncFreeze[1], 0)
      const synced = frozen ? plus(sc.syncFreeze![0], -1) : plus(d, -1)
      const visible = runs.filter((r) => r.date <= synced)
      const fitness = fitnessOn(runs, synced, sc.tsbBias ?? 0)
      if ((fitness.tsb ?? 0) < -25 || (fitness.acwr ?? 0) > 1.5) redDays++
      day.synced = synced; day.fitness = fitness

      const before = effectiveSessions(manual, state.overrides, P)
      const r = runEngine({ today: d, at: `${d}T07:00:00.000Z`, manual, state, runs: visible, fitness, syncedThrough: synced, pauses })
      const after = effectiveSessions(manual, r.state.overrides, P)
      const allowPast = [
        ...r.added.filter((x) => x.rule === 'missed-key' && x.status === 'active')
          .flatMap((x) => Object.entries(x.after).filter(([k, s]) => k < d && s.type === 'rest').map(([k]) => k)),
      ]
      record('engine', checkInvariants({
        writer: 'engine', today: d, manual, before, after,
        writes: r.added.filter((x) => x.status === 'active').flatMap((x) => Object.keys(x.after)),
        logged: engineLogged(r.added, r.state.log), ran: new Set(actualOf(visible).keys()), allowPast,
      }), { before, keys: r.added.map((x) => x.key) }, d)
      state = r.state
      opts.onDay?.({ date: d, manual, state, runs: visible, synced, fitness })
      day.engine = r.added.map((x) => `${x.rule}${x.status === 'active' ? '' : ` (${x.status})`}: ${x.reason}`)

      // Sunday: Plan anpassen for the next two weeks, first suggestion applied.
      if (getDay(parseISO(d)) === 0) {
        const sessions = effectiveSessions(manual, state.overrides, P)
        const actual = actualOf(visible)
        const input = { today: d, period: periodFor({ kind: 'weeks', weeks: 2 }, d, events), sessions, manual, actual,
          fitness, events, profile, recent: recentVolume(d, sessions, actual), pauses: P }
        const first = suggestions(input)[0]
        if (first) {
          const applied = applyChanges(manual, first, input.period, `${d}T18:00:00.000Z`)
          record('workshop', checkInvariants({
            writer: 'workshop', today: d, before: sessions, after: effectiveSessions(applied.manual, state.overrides, P),
            ran: new Set([...actual].filter(([, k]) => k > 0).map(([k]) => k)), profile,
          }), { before: sessions, kind: first.kind }, d)
          manual = applied.manual
          workshopApplied++
          day.workshop = `${first.title} (${Object.keys(first.changes).join(', ')})`
        }
      }

      // The day itself: the athlete runs the effective session, or not.
      const s = effectiveSessions(manual, state.overrides, P).find((x) => x.date === d)
      const planned = planKm(s) || (s?.type === 'race' ? s.km ?? 0 : 0)
      const wd = (getDay(parseISO(d)) || 7) as Weekday
      const off = inRange(d, sc.off) || (sc.runDays && !sc.runDays.includes(wd))
      if (planned > 0 && !off && rand() >= (sc.skip ?? 0)) {
        const factor = (sc.kmFactor ?? 1) * (0.95 + rand() * 0.1)
        const pace = sessionPaceS(s) + (sc.paceDelta ?? 0) + Math.round((rand() - 0.5) * 8)
        const hr = Math.round((s?.pace ? 160 : 140) + (sc.hrDelta ?? 0) + (rand() - 0.5) * 8)
        runs.push(makeRun(d, planned * factor, pace, hr))
        day.run = `${r1(planned * factor)} km in ${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')}, HF ${hr}`
      }

      // Track how often each coming day's session changed.
      for (const x of effectiveSessions(manual, state.overrides, P)) {
        if (x.date < d) continue
        const v = JSON.stringify(x), list = seen.get(x.date) ?? []
        if (list[list.length - 1] !== v) seen.set(x.date, [...list, v])
      }
    } catch (e) {
      errors.push({ date: d, message: e instanceof Error ? e.message : String(e) })
    }
    if (opts.verbose) log.push(day)
  }

  const finalPauses: Pause[] = !sc.markPause ? [] : (sc.off ?? []).map(([a, b], i) => ({ id: `sim-${i}`, kind: 'krank' as const, from: a, to: b }))
  const final = effectiveSessions(manual, state.overrides, { pauses: finalPauses, today: opts.until ?? RECOVERY_END }).filter((s) => s.date >= PLAN_START)
  const weekKm = (list: PlanSession[]) => {
    const m = new Map<string, number>()
    for (const s of list) { const w = weekOf(s.date)?.start ?? s.date; m.set(w, (m.get(w) ?? 0) + planKm(s)) }
    return Math.max(...m.values())
  }
  const base = SESSIONS.filter((s) => s.date >= PLAN_START)
  const engineChanges = state.log.filter((c) => c.status === 'active').length
  const weeks = Math.ceil(final.length / 7)
  const planRuns = runs.filter((r) => r.date >= PLAN_START)
  const missedKm = base.filter((s) => s.date <= RECOVERY_END)
    .reduce((t, s) => t + Math.max(0, planKm(s) - planRuns.filter((r) => r.date === s.date).reduce((a, r) => a + r.km, 0)), 0)
  return {
    scenario: sc.name, seed, violations, known: knownHits, errors, log,
    metrics: {
      basePlanKm: r1(base.reduce((t, s) => t + planKm(s), 0)),
      finalPlanKm: r1(final.reduce((t, s) => t + planKm(s), 0)),
      runKm: r1(planRuns.reduce((t, r) => t + r.km, 0)),
      baseMaxWeekKm: r1(weekKm(base)), maxWeekKm: r1(weekKm(final)),
      flipFlopDays: [...seen.values()].filter((v) => v.length >= 4).length,   // first version + ≥ 3 changes
      engineChanges, changesPerWeek: r1(engineChanges / weeks),
      missedKm: r1(missedKm),
      rebalancedKm: r1(state.log.filter((c) => c.rule === 'rebalance' && c.status === 'active').reduce((t, c) => t + (c.addedKm ?? 0), 0)),
      workshopApplied, redDays,
    },
  }
}

// Soft signals of many seasons: mean and max per metric.
export function summarize(results: SimResult[]) {
  const keys = Object.keys(results[0].metrics) as (keyof SimResult['metrics'])[]
  const stats = Object.fromEntries(keys.map((k) => {
    const v = results.map((r) => r.metrics[k])
    return [k, { mean: r1(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v) }]
  }))
  const known: Record<string, number> = {}
  for (const r of results) for (const [k, n] of Object.entries(r.known)) known[k] = (known[k] ?? 0) + n
  return {
    seasons: results.length,
    hardFailures: results.reduce((t, r) => t + r.violations.length + r.errors.length, 0),
    failingSeeds: results.filter((r) => r.violations.length || r.errors.length).map((r) => r.seed),
    known, stats,
  }
}
