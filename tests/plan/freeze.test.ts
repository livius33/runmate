// Go live (07-14): a draft frozen into a training block; the rules for going live.
import { describe, expect, it } from 'vitest'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft, goLiveError } from '@/lib/plan/generator/freeze'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { checkDays } from './days-check'
import { checkWorkouts } from './workouts-check'

const LIVIUS: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const template = listMethodologies().valid.find((m) => m.id === 'pfitzinger-half')!.params
const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
const draft = generateDraft({ goal: hm, template, start: '2026-11-30', profile: LIVIUS,
  measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft
const block = freezeDraft(draft, hm, 'Pfitzinger – Halbmarathon', template)

describe('Entwurf einfrieren (AC-2)', () => {
  it('Block: Start 30.11., Ende nach 2 Erholungswochen (07-22), Rennen als fester Termin, RaceInfo aus dem Ziel', () => {
    expect([block.id, block.planStart, block.end]).toEqual(['gen-hm-2027', '2026-11-30', '2027-03-14'])
    expect(block.sessions.find((s) => s.type === 'race')).toMatchObject({ date: '2027-02-28', anchor: true, title: hm.name, km: 21.1 })
    expect(block.race).toMatchObject({ code: 'HM', date: '2027-02-28', goalS: 5100, goalPaceS: 242, fallbackS: 5280 })
    expect(block.weeks).toHaveLength(draft.skeleton.weeks.length + 2)
    expect(block.weeks.slice(-2).every((w) => w.recovery)).toBe(true)
  })
  it('Tage und Einheiten des Blocks bestehen weiter alle Prüfungen', () => {
    const base = { template, distance: 'half' as const, raceDate: hm.date, raceName: hm.name, profile: LIVIUS, goalS: 5100, recentRace: null }
    const toRace = block.sessions.filter((s) => s.date <= draft.days.weeks[draft.days.weeks.length - 1].end)   // recovery weeks: own tests
    const days = { ...draft.days, sessions: toRace }
    expect(checkDays(days, draft.skeleton, { ...base, racePaceS: draft.paces.racePaceS, longest30Km: 16, longest12mKm: 42.2 })).toEqual([])
    expect(checkWorkouts({ ...draft.workouts, sessions: toRace }, draft.days, draft.skeleton, base)).toEqual([])
  })
  it('Live schalten nur in der Zukunft, ohne Überschneidung, einmal pro Rennen', () => {
    expect(goLiveError(block, [PORTO_2026], '2026-10-25')).toBeNull()
    expect(goLiveError(block, [PORTO_2026], '2026-12-01')).toContain('Zukunft')
    expect(goLiveError({ ...block, planStart: '2026-11-23' }, [PORTO_2026], '2026-10-25')).toContain('Überschneidet sich')
    expect(goLiveError({ ...block, id: 'gen-other' }, [PORTO_2026, block], '2026-10-25')).toContain('Überschneidet sich')
  })
})
