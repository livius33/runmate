// Property tests for Plan anpassen (lib/plan/workshop.ts): suggestions, the finalize() safety net, apply/undo.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { applyChanges, finalize, periodFor, recentVolume, suggestions, undoEntry, type PeriodChoice, type WorkshopInput } from '@/lib/plan/workshop'
import { effectiveSessions, type Overrides } from '@/lib/plan/effective'
import { RACE, SESSIONS } from '@/examples/porto-2026/plan'
import { type PlanSession, type SessionType } from '@/lib/plan/types'
import { weekOf } from '@/lib/plan/blocks'
import { actualOf, fitnessArb, manualArb, plus, profileArb, runsArb, todayArb } from './arbitraries'
import { checkInvariants, formatViolation } from './invariants'

const RUNS = 500
const events = [
  { date: RACE.date, name: RACE.name },
  ...SESSIONS.filter((s) => s.anchor).map((s) => ({ date: s.date, name: s.title })),
]

const choiceArb: fc.Arbitrary<PeriodChoice> = fc.oneof(
  fc.constant({ kind: 'event' as const }),
  fc.integer({ min: 1, max: 6 }).map((weeks) => ({ kind: 'weeks' as const, weeks })),
  fc.tuple(fc.integer({ min: -14, max: 14 }), fc.integer({ min: 0, max: 40 })).map(([a, n]) => ({ kind: 'range' as const, from: plus('2026-10-10', a), to: plus('2026-10-10', a + n) })),
)

const inputArb: fc.Arbitrary<WorkshopInput> = todayArb.chain((today) =>
  runsArb(today, SESSIONS).chain((runs) => {
    const actual = actualOf(runs)
    return fc.record({
      manual: manualArb(today, actual), fitness: fitnessArb, choice: choiceArb,
      profile: fc.oneof(fc.constant(null), profileArb),
    }).map(({ manual, fitness, choice, profile }) => {
      const sessions = effectiveSessions(manual)
      return { today, period: periodFor(choice, today, events), sessions, manual, actual, fitness, events, profile,
        recent: recentVolume(today, sessions, actual) }
    })
  }))

function check(input: WorkshopInput, changes: Overrides) {
  const after = effectiveSessions({ ...input.manual, ...changes })
  return checkInvariants({
    writer: 'workshop', today: input.today, before: input.sessions, after,
    ran: new Set([...input.actual].filter(([, km]) => km > 0).map(([d]) => d)), profile: input.profile,
  }).map(formatViolation)
}

// Deliberately wild raw changes: any type, any km, any day of the plan — finalize() must make them safe.
const rawArb = (dates: string[]) => fc.dictionary(
  fc.constantFrom(...dates),
  fc.record({ type: fc.constantFrom<SessionType>('easy', 'tempo', 'long', 'intervals', 'rest', 'recovery'), km: fc.integer({ min: 0, max: 45 }) })
    .map(({ type, km }) => ({ type, km: type === 'rest' ? undefined : km, title: 'Testeinheit' }) as Omit<PlanSession, 'date'>),
  { maxKeys: 8 },
)

describe('Plan anpassen: Regeln gelten immer', () => {
  it('Vorschläge verletzen keine Invariante', () => {
    fc.assert(fc.property(inputArb, (input) => {
      for (const s of suggestions(input)) {
        expect({ s: s.id, v: check(input, s.changes) }).toEqual({ s: s.id, v: [] })
      }
    }), { numRuns: RUNS })
  })

  it('finalize() macht beliebige Änderungen sicher', () => {
    fc.assert(fc.property(inputArb.chain((input) => rawArb(SESSIONS.map((s) => s.date)).map((raw) => ({ input, raw }))), ({ input, raw }) => {
      const changes = finalize(input, Object.fromEntries(Object.entries(raw).map(([d, s]) => [d, { ...s, date: d }])))
      expect(check(input, changes)).toEqual([])
    }), { numRuns: RUNS })
  })

  it('Übernehmen und Rückgängig ergeben genau die vorherigen Änderungen', () => {
    fc.assert(fc.property(inputArb, (input) => {
      for (const s of suggestions(input)) {
        const { manual, entry } = applyChanges(input.manual, s, input.period, `${input.today}T10:00:00Z`)
        const back = undoEntry(manual, entry)
        expect(back.manual).toEqual(input.manual)
        expect(back.changedSince).toEqual([])
      }
    }), { numRuns: RUNS })
  })

  it('ist deterministisch', () => {
    fc.assert(fc.property(inputArb, (input) => {
      expect(suggestions(input)).toEqual(suggestions(input))
    }), { numRuns: RUNS })
  })
})
