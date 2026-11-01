// fast-check generators for plan inputs over the Porto plan dates. Manual edits are built with the
// app's own helpers (setDayKm, applyMove, setZone2), so they are edits the runner could really make.
import fc from 'fast-check'
import { addDays, format, parseISO, differenceInCalendarDays } from 'date-fns'
import { PLAN_START, RECOVERY_END, SESSIONS } from '@/examples/porto-2026/plan'
import { type PlanSession } from '@/lib/plan/types'
import { paceToS } from '@/lib/plan/format'
import { athlete } from '@/lib/athlete'
import { applyMove, effectiveSessions, setDayKm, setZone2, type ActualKm, type MoveMode, type Overrides } from '@/lib/plan/effective'
import type { DatedRun } from '@/lib/plan/pace-check'
import type { Fitness } from '@/lib/plan/engine'
import type { AthleteProfile, Weekday } from '@/lib/plan/athlete-profile'

export const plus = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
export const PLAN_DAYS = differenceInCalendarDays(parseISO(RECOVERY_END), parseISO(PLAN_START)) + 1
export const planDate = (i: number) => plus(PLAN_START, i)
export const easyPaceS = paceToS(athlete().easyPace)

export const dateArb = fc.integer({ min: 0, max: PLAN_DAYS - 1 }).map(planDate)
// "Today" from the second plan day on, so there is always a past.
export const todayArb = fc.integer({ min: 1, max: PLAN_DAYS - 1 }).map(planDate)

// One run that matches a session: km and pace scaled; splits per full km at the run's pace.
export function makeRun(date: string, kmRun: number, paceS: number, avgHr: number | null, n = 0): DatedRun {
  const full = Math.max(1, Math.floor(kmRun))
  return {
    id: `run-${date}-${n}`, date, km: Math.round(kmRun * 10) / 10, paceS, avgHr,
    splitPacesS: Array.from({ length: full }, () => paceS),
    splitHrs: Array.from({ length: full }, () => avgHr),
  }
}

export const sessionPaceS = (s?: PlanSession) => (s?.pace ? paceToS(s.pace) : easyPaceS)

// What happened on each past day: skip, run (km × factor, pace ± delta), or an extra run on a free day.
const dayOutcome = fc.record({
  kind: fc.constantFrom('run', 'run', 'run', 'skip', 'extra'),
  kmFactor: fc.double({ min: 0.4, max: 1.35, noNaN: true }),
  paceDelta: fc.integer({ min: -20, max: 40 }),
  hr: fc.oneof(fc.constant(null), fc.integer({ min: 120, max: 190 })),
})

export function runsArb(today: string, sessions: PlanSession[]) {
  const past = Array.from({ length: Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(PLAN_START))) }, (_, i) => planDate(i))
  return fc.array(dayOutcome, { minLength: past.length, maxLength: past.length }).map((outcomes) => {
    const runs: DatedRun[] = []
    past.forEach((d, i) => {
      const o = outcomes[i]
      const s = sessions.find((x) => x.date === d)
      const planned = s && s.type !== 'rest' ? s.km ?? 0 : 0
      if (o.kind === 'skip') return
      if (planned > 0 && o.kind === 'run') runs.push(makeRun(d, planned * o.kmFactor, sessionPaceS(s) + o.paceDelta, o.hr))
      if (planned === 0 && o.kind === 'extra') runs.push(makeRun(d, 5 + 10 * o.kmFactor, easyPaceS + o.paceDelta, o.hr))
    })
    return runs
  })
}

export const actualOf = (runs: DatedRun[]): ActualKm => {
  const m: ActualKm = new Map()
  for (const r of runs) m.set(r.date, Math.round(((m.get(r.date) ?? 0) + r.km) * 10) / 10)
  return m
}

// Manual edits: a short sequence of real UI operations applied from today on.
const op = fc.oneof(
  fc.record({ op: fc.constant('km' as const), day: fc.integer({ min: 0, max: 20 }), km: fc.integer({ min: 0, max: 30 }) }),
  fc.record({ op: fc.constant('move' as const), day: fc.integer({ min: 0, max: 20 }), shift: fc.integer({ min: -3, max: 3 }), mode: fc.constantFrom<MoveMode>('move', 'swap', 'merge') }),
  fc.record({ op: fc.constant('z2' as const), day: fc.integer({ min: 0, max: 20 }) }),
)

export function manualArb(today: string, actual: ActualKm) {
  return fc.array(op, { maxLength: 4 }).map((ops) => {
    let manual: Overrides = {}
    for (const o of ops) {
      const sessions = effectiveSessions(manual)
      const d = plus(today, o.day)
      if (d > RECOVERY_END) continue
      if (o.op === 'km') manual = setDayKm(manual, d, o.km, sessions)
      else if (o.op === 'z2') manual = setZone2(manual, d, sessions)
      else manual = applyMove(manual, d, plus(d, o.shift), o.mode, today, sessions, actual)
    }
    return manual
  })
}

export const fitnessArb: fc.Arbitrary<Fitness> = fc.record({
  tsb: fc.oneof(fc.constant(null), fc.integer({ min: -40, max: 25 })),
  acwr: fc.oneof(fc.constant(null), fc.double({ min: 0.5, max: 2, noNaN: true })),
})

// Production always passes the last synced day; lag 1 = yesterday is synced.
export const lagArb = fc.integer({ min: 1, max: 10 })

export const profileArb: fc.Arbitrary<AthleteProfile> = fc.record({
  available: fc.subarray([1, 2, 3, 4, 5, 6, 7] as Weekday[], { minLength: 1 }),
  wd: fc.oneof(fc.constant(null), fc.integer({ min: 5, max: 40 })),
  we: fc.oneof(fc.constant(null), fc.integer({ min: 5, max: 40 })),
}).map(({ available, wd, we }) => ({
  v: 1, age: 40, weightKg: 70, heightCm: 175, experience: 'advanced', weeklyKm: 90,
  availableDays: available, longRunDay: 6, qualityDays: [2], kbDays: [], restDay: null,
  maxKmWeekday: wd, maxKmWeekend: we, fitnessMethod: null, thresholdPaceS: null, fiveKS: null, savedAt: null,
}))

// Everything the engine needs on one day.
export const engineCaseArb = todayArb.chain((today) =>
  runsArb(today, SESSIONS).chain((runs) =>
    fc.record({
      today: fc.constant(today),
      runs: fc.constant(runs),
      manual: manualArb(today, actualOf(runs)),
      fitness: fitnessArb,
      lag: lagArb,
    })))
