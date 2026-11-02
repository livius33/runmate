// AC-1 and AC-4 (Phase 5): the onboarding's state machine (order, skippable steps, back, finish, resume from the saved
// state) as properties over random event sequences, and the profile step (HFmax estimate, race → threshold pace).
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ALL_STEPS, SKIPPABLE, allSettled, apply, currentStep, newState, stepsFor, storedState, type OnboardingEvent, type OnboardingState, type Step } from '@/lib/onboarding/flow'
import { HRMAX_ESTIMATE_NOTE, buildProfiles, estimateHrMax, parseRaceTime, type ProfileInput } from '@/lib/onboarding/profile'
import { validProfile } from '@/lib/plan/athlete-profile'

const AT = '2026-11-02T10:00:00.000Z'
const eventArb: fc.Arbitrary<OnboardingEvent> = fc.oneof(
  fc.record({ type: fc.constant('complete' as const), step: fc.constantFrom(...ALL_STEPS) }),
  fc.record({ type: fc.constant('skip' as const), step: fc.constantFrom(...ALL_STEPS) }),
  fc.constant({ type: 'back' as const }),
  fc.constant({ type: 'finish' as const }),
)

describe('Ablauf (AC-1)', () => {
  it('ohne Einwilligungspflicht kein Einwilligungsschritt', () => {
    expect(stepsFor({ consentRequired: false })).toEqual(['profile', 'source', 'goal'])
    expect(stepsFor({ consentRequired: true })).toEqual(['consent', 'profile', 'source', 'goal'])
  })

  it('der Reihe nach: erst Einwilligung, dann Profil; Profil lässt sich nicht überspringen', () => {
    const steps = stepsFor({ consentRequired: true })
    let s = newState(AT)
    expect(currentStep(s, steps)).toBe('consent')
    expect(apply(s, { type: 'complete', step: 'profile' }, steps, AT)).toEqual({ ok: false, error: 'Bitte die Schritte der Reihe nach durchgehen.' })
    expect(apply(s, { type: 'skip', step: 'consent' }, steps, AT).ok).toBe(false)
    s = (apply(s, { type: 'complete', step: 'consent' }, steps, AT) as { state: OnboardingState }).state
    expect(apply(s, { type: 'skip', step: 'profile' }, steps, AT)).toEqual({ ok: false, error: '„Profil“ lässt sich nicht überspringen.' })
    s = (apply(s, { type: 'complete', step: 'profile' }, steps, AT) as { state: OnboardingState }).state
    s = (apply(s, { type: 'skip', step: 'source' }, steps, AT) as { state: OnboardingState }).state
    expect(apply(s, { type: 'finish' }, steps, AT).ok).toBe(false)
    s = (apply(s, { type: 'skip', step: 'goal' }, steps, AT) as { state: OnboardingState }).state
    expect(s.goal).toBe('base')
    expect(currentStep(s, steps)).toBeNull()
    const done = apply(s, { type: 'finish' }, steps, AT)
    expect(done.ok && done.state.completedAt).toBe(AT)
    expect(apply((done as { state: OnboardingState }).state, { type: 'back' }, steps, AT).ok).toBe(false)
  })

  it('Zurück öffnet den vorigen Schritt; danach geht es beim ersten offenen weiter', () => {
    const steps = stepsFor({ consentRequired: false })
    let s = (apply(newState(AT), { type: 'complete', step: 'profile' }, steps, AT) as { state: OnboardingState }).state
    s = (apply(s, { type: 'back' }, steps, AT) as { state: OnboardingState }).state
    expect(currentStep(s, steps)).toBe('profile')
    expect(apply(s, { type: 'back' }, steps, AT)).toEqual({ ok: false, error: 'Das ist der erste Schritt.' })
    s = (apply(s, { type: 'complete', step: 'profile' }, steps, AT) as { state: OnboardingState }).state
    expect(currentStep(s, steps)).toBe('source')
  })

  it('Eigenschaften über beliebige Ereignisfolgen', () => {
    fc.assert(fc.property(fc.boolean(), fc.array(eventArb, { maxLength: 30 }), (consentRequired, events) => {
      const steps = stepsFor({ consentRequired })
      let s = newState(AT)
      for (const e of events) {
        const before = currentStep(s, steps)
        const r = apply(s, e, steps, AT)
        if (!r.ok) continue
        const next = r.state
        // Only the step on screen can be completed or skipped, and only source/goal can be skipped.
        if (e.type === 'complete' || e.type === 'skip') expect(e.step).toBe(before)
        if (e.type === 'skip') expect(SKIPPABLE).toContain(e.step)
        if (e.type === 'finish') expect(allSettled(s, steps)).toBe(true)
        // Settled steps form a prefix of the order (nobody gets ahead of an open step).
        const open = steps.findIndex((x) => !next.done.includes(x) && !next.skipped.includes(x))
        if (open >= 0) for (const x of steps.slice(open + 1)) expect(next.done.includes(x) || next.skipped.includes(x)).toBe(false)
        expect(next.done.some((x) => next.skipped.includes(x))).toBe(false)
        // Saved and read back: the same step resumes.
        const back = storedState(JSON.parse(JSON.stringify(next)))!
        expect(currentStep(back, steps)).toBe(currentStep(next, steps))
        expect(back).toEqual(next)
        s = next
      }
    }), { numRuns: 300 })
  })

  it('kaputter gespeicherter Zustand: wie nicht begonnen; unbekannte Schritte fallen weg', () => {
    expect(storedState(null)).toBeNull()
    expect(storedState({ v: 2 })).toBeNull()
    const s = storedState({ v: 1, done: ['profile', 'x'], skipped: ['profile', 'goal'], at: 'nope', goal: 'y', startedAt: AT, completedAt: 5 })!
    expect(s).toEqual({ v: 1, done: ['profile'], skipped: ['goal'], at: null, goal: null, startedAt: AT, completedAt: null })
  })

  it('jeder Schritt hat ein Label und ist in ALL_STEPS', () => {
    for (const st of stepsFor({ consentRequired: true })) expect((ALL_STEPS as readonly Step[]).includes(st)).toBe(true)
  })
})

const INPUT: ProfileInput = {
  hrMax: 188, hrMaxUnknown: false, age: null, hrRest: 52, race: null, weightKg: null, timezone: 'Europe/Berlin',
  weeklyKm: 35, experience: 'intermediate', runDays: [1, 2, 4, 6, 7], longRunDay: 7,
}

describe('Profil (AC-4)', () => {
  it('HFmax „weiß ich nicht“: 208 − 0,7 × Alter, mit Hinweis', () => {
    const r = buildProfiles({ ...INPUT, hrMax: null, hrMaxUnknown: true, age: 40 })
    expect(r.ok && r.user.hrMax).toBe(180)
    expect(r.ok && r.notes).toEqual([HRMAX_ESTIMATE_NOTE])
    expect(estimateHrMax(25)).toBe(191)
    expect(buildProfiles({ ...INPUT, hrMax: null, hrMaxUnknown: true, age: null })).toMatchObject({ ok: false })
    expect(buildProfiles({ ...INPUT, hrMax: null, hrMaxUnknown: true, age: 9 })).toMatchObject({ ok: false })
    expect(buildProfiles({ ...INPUT, hrMax: null, hrMaxUnknown: true, age: 95 })).toMatchObject({ ok: false })
  })

  it('Ruhepuls unbekannt bleibt leer (Beispielwert), Zeitzone und Gewicht übernommen', () => {
    const r = buildProfiles({ ...INPUT, hrRest: null, weightKg: 61.5, timezone: 'America/New_York' })
    expect(r.ok && [r.user.hrRest, r.user.weightKg, r.user.timezone]).toEqual([null, 61.5, 'America/New_York'])
    expect(buildProfiles({ ...INPUT, timezone: 'Mars/Olympus' })).toMatchObject({ ok: false, error: expect.stringContaining('Zeitzone') })
  })

  it('Rennzeit → Schwellentempo (Halbmarathon, 10 km), 5 km als 5-km-Zeit, Marathon als Bestzeit', () => {
    const hm = buildProfiles({ ...INPUT, race: { distance: 'half', time: '1:45:00' } })
    expect(hm.ok && hm.athlete).toMatchObject({ fitnessMethod: 'threshold', thresholdPaceS: Math.round(6300 / 21.0975 + 8) })
    const tenK = buildProfiles({ ...INPUT, race: { distance: '10k', time: '45:00' } })
    expect(tenK.ok && tenK.athlete.thresholdPaceS).toBe(270 + 15)
    const five = buildProfiles({ ...INPUT, race: { distance: '5k', time: '22:30' } })
    expect(five.ok && five.athlete).toMatchObject({ fitnessMethod: 'fiveK', fiveKS: 1350, thresholdPaceS: null })
    const mar = buildProfiles({ ...INPUT, race: { distance: 'marathon', time: '3:30:00' } })
    expect(mar.ok && [mar.user.pbTime, mar.user.pbRace]).toEqual(['3:30:00', 'Marathon'])
    expect(buildProfiles({ ...INPUT, race: { distance: 'half', time: '0:30:00' } })).toMatchObject({ ok: false })
    expect(parseRaceTime('1:45')).toBe(105)          // mm:ss
    expect(parseRaceTime('abc')).toBeNull()
  })

  it('Trainingsprofil gültig: Longrun-Tag unter den Lauftagen, Qualitätstage nicht nach dem Longrun, nie nebeneinander', () => {
    const r = buildProfiles({ ...INPUT, runDays: [1, 2, 3, 4, 6, 7], longRunDay: 7 })
    if (!r.ok) throw new Error(r.error)
    expect(validProfile(r.athlete)).toBe(true)
    expect(r.athlete.longRunDay).toBe(7)
    expect(r.athlete.qualityDays).toEqual([2, 4])
    expect(r.athlete.restDay).toBe(5)
    expect(buildProfiles({ ...INPUT, runDays: [] })).toMatchObject({ ok: false })
    expect(buildProfiles({ ...INPUT, runDays: [2, 4], longRunDay: 7 })).toMatchObject({ ok: true, athlete: { longRunDay: 4 } })
  })
})
