// The whole draft in one call (07-06): HM goal → paces, skeleton, days, workouts that pass all three checkers.
import { describe, expect, it } from 'vitest'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { generateDraft, type Draft, type DraftChoice } from '@/lib/plan/generator/draft'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { checkSkeleton } from './skeleton-check'
import { checkDays } from './days-check'
import { checkWorkouts } from './workouts-check'

const template = (id: string) => listMethodologies().valid.find((m) => m.id === id)!.params
const LIVIUS: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
const choice: DraftChoice = {
  goal: hm, template: template('pfitzinger-half'), start: '2026-11-30', profile: LIVIUS,
  measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 101, longest30Km: 16, longest12mKm: 42.2, recentRace: null },
}

describe('Entwurf in einem Aufruf (AC-2)', () => {
  it('HM-Ziel der Saison: alle drei Prüfungen bestehen, Warnungen je Schritt', () => {
    const d = generateDraft(choice) as Draft
    expect(d.ok).toBe(true)
    const base = { template: choice.template, distance: d.distance, raceDate: hm.date, raceName: hm.name, profile: LIVIUS, goalS: hm.goalS!, recentRace: null }
    expect(checkSkeleton(d.skeleton, { ...base, start: choice.start, currentKm: 50, provenKm: 101 })).toEqual([])
    const daysIn = { ...base, racePaceS: d.paces.racePaceS, longest30Km: 16, longest12mKm: 42.2 }
    expect(checkDays(d.days, d.skeleton, daysIn)).toEqual([])
    expect(checkWorkouts(d.workouts, d.days, d.skeleton, base)).toEqual([])
    expect(d.warnings.every((w) => ['Wochen', 'Tage', 'Einheiten'].includes(w.step))).toBe(true)
    expect(d.skeleton.peak.why.join(' ')).toContain('letzte Woche deines Erholungsblocks')
  })
  it('Überschreiben: Wert und Herkunft "von dir gesetzt"', () => {
    const d = generateDraft({ ...choice, overrides: { currentKm: 60, peakKm: 90 } }) as Draft
    expect(d.inputs.currentKm).toEqual({ value: 60, measured: 50, override: true })
    expect(d.inputs.peakKm).toMatchObject({ value: 90, override: true })
    expect(d.skeleton.peakKm).toBe(90)
    expect(d.skeleton.peak.why.join(' ')).toContain('von dir gesetzt')
  })
  it('Fehler: Backyard ohne Vorlage, zu kurz, zu wenige Lauftage, Zielzeit fehlt', () => {
    expect(generateDraft({ ...choice, goal: EXAMPLE_GOALS.find((g) => g.kind === 'backyard')! })).toEqual({ ok: false, error: 'Für Backyard Ultra gibt es noch keine Vorlage.' })
    expect(generateDraft({ ...choice, start: '2027-02-08' })).toMatchObject({ ok: false, error: expect.stringContaining('Mindestens') })
    expect(generateDraft({ ...choice, profile: { ...LIVIUS, availableDays: [6] } })).toMatchObject({ ok: false, error: expect.stringContaining('Zu wenige Lauftage') })
    expect(generateDraft({ ...choice, goal: { ...hm, goalS: null } })).toMatchObject({ ok: false, error: expect.stringContaining('Zielzeit fehlt') })
  })
})
