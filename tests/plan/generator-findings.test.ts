// Findings from the generator grid (08): each one reproduced with the fixed input that showed it.
import { describe, expect, it } from 'vitest'
import { listMethodologies, listOwnBases } from '@/lib/plan/methodology/load'
import { generateDraft, type Draft, type DraftChoice } from '@/lib/plan/generator/draft'
import { profileMaxKm, type AthleteProfile } from '@/lib/plan/athlete-profile'
import type { GoalKind } from '@/lib/season/goals'
import type { MeasuredInputs } from '@/lib/plan/generator/inputs'

const template = (id: string) => [...listMethodologies().valid, ...listOwnBases().valid].find((m) => m.id === id)!.params
const PROFILE: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'intermediate', weeklyKm: 40,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: null, thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const MEASURED: MeasuredInputs = { currentKm: 40, currentKmSource: 'mean4', provenKm: 40, longest30Km: 16, longest12mKm: 21.1, recentRace: null }
const draft = (id: string, kind: GoalKind, date: string, start: string, goalS: number, profile: Partial<AthleteProfile>, measured: Partial<MeasuredInputs> = {}) => {
  const c: DraftChoice = {
    goal: { id: 'g', kind, priority: 'A', name: 'Testlauf', date, confirmed: true, distanceKm: null, goalS, loops: null },
    template: template(id), start, profile: { ...PROFILE, ...profile }, measured: { ...MEASURED, ...measured },
  }
  const d = generateDraft(c)
  if (!d.ok) throw new Error(d.error)
  return d as Draft
}

describe('Befunde Generator-Raster', () => {
  // G-01: with a weekday limit of 3 km the Generalprobe landed on a 3-km key slot: "2 ein → 0 km @ 4:59 → 1 aus".
  it('G-01 Generalprobe nie mit 0 oder negativen Tempo-Kilometern', () => {
    for (const maxKmWeekday of [1, 3]) {
      const d = draft('pfitzinger-half', 'half', '2027-03-28', '2027-01-19', 6300,
        { availableDays: [2, 3, 4, 5, 6], longRunDay: 5, qualityDays: [6, 7], restDay: null, maxKmWeekday }, { currentKm: 25, provenKm: 25 })
      const broken = d.workouts.sessions.filter((s) => /(^|\s)-?0? ?km @|(^|\s)-\d/.test(s.notes ?? ''))
      expect(broken.map((s) => `${s.date}: ${s.notes}`)).toEqual([])
      expect(d.workouts.sessions.filter((s) => s.test && (s.km ?? 0) < 4).map((s) => s.date)).toEqual([])
      expect(d.warnings.map((w) => w.text).join(' ')).toContain('Generalprobe passt in KW')
    }
  })

  // G-02: the recovery weeks after the race ignored the profile's day limit (6,5 km on a Wednesday limited to 5 km;
  // 28 km on a Sunday limited to 12 km).
  it('G-02 Erholungswochen nach dem Rennen halten das Tageslimit', () => {
    const cases = [
      draft('runmate-own-half', 'half', '2027-04-25', '2027-01-21', 3900, { availableDays: [3, 6, 7], longRunDay: 7, restDay: null, maxKmWeekday: 5, maxKmWeekend: 8, thresholdPaceS: 285 }, { currentKm: 25, provenKm: 25, longest30Km: 32 }),
      draft('pfitzinger-half', 'half', '2027-10-31', '2027-08-09', 3900, { availableDays: [5, 6, 7], longRunDay: 3, restDay: null, maxKmWeekend: 12 }, { currentKm: 60, provenKm: 100, longest30Km: 42.2 }),
    ]
    for (const d of cases) {
      const profile = { ...PROFILE, maxKmWeekday: d === cases[0] ? 5 : null, maxKmWeekend: d === cases[0] ? 8 : 12 }
      const runs = d.recovery!.sessions.filter((s) => s.type !== 'rest')
      expect(runs.length).toBeGreaterThan(0)
      expect(runs.filter((s) => (s.km ?? 0) > (profileMaxKm(profile, s.date) ?? Infinity)).map((s) => `${s.date}: ${s.km} km`)).toEqual([])
    }
  })
})
