// Findings from the generator grid (08): each one reproduced with the fixed input that showed it.
import { describe, expect, it } from 'vitest'
import { listMethodologies, listOwnBases } from '@/lib/plan/methodology/load'
import { generateDraft, type Draft, type DraftChoice } from '@/lib/plan/generator/draft'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
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
})
