// Property tests for the feedback loop (07-25): with any feedback, Plan anpassen keeps its invariants, never makes a
// pace faster, never offers the feedback suggestion next to the fatigue guard, and ignores absent feedback.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { feedbackSignals, type FeedbackInput, type FeedbackRun } from '@/lib/feedback/rules'
import { periodFor, suggestions, type WorkshopInput } from '@/lib/plan/workshop'
import { effectiveSessions, type Overrides } from '@/lib/plan/effective'
import { paceToS } from '@/lib/plan/format'
import { RACE, SESSIONS } from '@/examples/porto-2026/plan'
import { weekOf } from '@/lib/plan/blocks'
import type { DatedRun } from '@/lib/plan/pace-check'
import { actualOf, fitnessArb, manualArb, plus, profileArb, runsArb, todayArb } from '../plan/arbitraries'
import { checkInvariants, formatViolation } from '../plan/invariants'

const RUNS = 300
const events = [{ date: RACE.date, name: RACE.name }, ...SESSIONS.filter((s) => s.anchor).map((s) => ({ date: s.date, name: s.title }))]
const feelArb = fc.oneof(fc.constant(null), fc.constantFrom(1, 2, 3, 4, 5) as fc.Arbitrary<1 | 2 | 3 | 4 | 5>)
const painArb = fc.oneof(fc.constant(null), fc.constantFrom('none', 'light', 'stop') as fc.Arbitrary<'none' | 'light' | 'stop'>)

// Every run gets random feedback (often none); the week entry is random too.
const feedbackArb = (today: string, runs: DatedRun[]): fc.Arbitrary<FeedbackInput> =>
  fc.record({
    per: fc.array(fc.record({ rpe: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 10 })), feel: feelArb, pain: painArb }), { minLength: runs.length, maxLength: runs.length }),
    week: fc.oneof(fc.constant(null), fc.record({ rating: feelArb.filter((x): x is 1 | 2 | 3 | 4 | 5 => x != null), fatigue: feelArb.filter((x): x is 1 | 2 | 3 | 4 | 5 => x != null) })
      .map((w) => ({ ...w, start: plus(today, -7), at: `${today}T08:00:00Z` }))),
  }).map(({ per, week }) => ({ runs: runs.map((r, i): FeedbackRun => ({ ...r, ...per[i] })), week }))

const inputArb: fc.Arbitrary<WorkshopInput> = todayArb.chain((today) =>
  runsArb(today, SESSIONS).chain((runs) =>
    fc.record({
      manual: manualArb(today, actualOf(runs)), fitness: fitnessArb, weeks: fc.integer({ min: 1, max: 6 }),
      profile: fc.oneof(fc.constant(null), profileArb), feedback: feedbackArb(today, runs),
    }).map(({ manual, fitness, weeks, profile, feedback }) => {
      const sessions = effectiveSessions(manual)
      return { today, period: periodFor({ kind: 'weeks', weeks }, today, events), sessions, manual, actual: actualOf(runs), fitness, events, profile, recent: null, feedback }
    })))

function check(input: WorkshopInput, changes: Overrides) {
  const after = effectiveSessions({ ...input.manual, ...changes })
  return checkInvariants({
    writer: 'workshop', today: input.today, before: input.sessions, after,
    ran: new Set([...input.actual].filter(([, km]) => km > 0).map(([d]) => d)), profile: input.profile,
  }).map(formatViolation)
}

describe('Feedback-Loop: Regeln gelten immer', () => {
  it('Vorschläge aus Feedback verletzen keine Invariante', () => {
    fc.assert(fc.property(inputArb, (input) => {
      for (const s of suggestions(input).filter((x) => x.kind === 'feedback-fatigue')) {
        expect({ s: s.id, v: check(input, s.changes) }).toEqual({ s: s.id, v: [] })
      }
    }), { numRuns: RUNS })
  })

  it('nie schneller: kein Vorschlag setzt ein schnelleres Tempo als vorher; der Feedback-Vorschlag ist immer locker', () => {
    fc.assert(fc.property(inputArb, (input) => {
      for (const s of suggestions(input)) {
        for (const r of s.diff) {
          if (r.before?.pace && r.after.pace) expect(paceToS(r.after.pace)).toBeGreaterThanOrEqual(paceToS(r.before.pace))
          if (s.kind === 'feedback-fatigue') expect(r.after).toMatchObject({ type: 'easy' })
          if (s.kind === 'feedback-fatigue') expect(r.after.pace).toBeUndefined()
        }
      }
    }), { numRuns: RUNS })
  })

  it('nie doppelt: Ermüdungsschutz und Feedback-Vorschlag schließen sich aus; ohne Feedback wie bisher', () => {
    fc.assert(fc.property(inputArb, (input) => {
      const kinds = suggestions(input).map((s) => s.kind)
      expect(kinds.includes('fatigue') && kinds.includes('feedback-fatigue')).toBe(false)
      const without = suggestions({ ...input, feedback: undefined })
      expect(without.map((s) => s.kind)).not.toContain('feedback-fatigue')
      expect(suggestions({ ...input, feedback: { runs: [] } })).toEqual(without)
    }), { numRuns: RUNS })
  })

  it('ist deterministisch und nennt nur Tage mit Lauf', () => {
    fc.assert(fc.property(inputArb, (input) => {
      const a = feedbackSignals(input)
      expect(a).toEqual(feedbackSignals(input))
      const ran = new Set(input.feedback!.runs.map((r) => r.date))
      for (const s of a) for (const d of 'dates' in s ? s.dates : [s.date]) expect(ran.has(d)).toBe(true)
      // the suggestion never touches a day inside a recovery week by more than the plan allows — covered by invariants above
      void weekOf
    }), { numRuns: RUNS })
  })
})
