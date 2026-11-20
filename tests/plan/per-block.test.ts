// Everything per block (07-20): the race a date belongs to decides distance, HR limits, tests and texts; Porto unchanged.
import { describe, expect, it } from 'vitest'
import { hrMax, raceHr } from '@/lib/analytics/hr'
import { athlete } from '@/lib/athlete'

describe('Renn-HF je Distanz (paces.md 2.1)', () => {
  // Shares of HFmax (lib/analytics/hr.ts); at HFmax 200: marathon 170/175, half 178/183, 10 km 185/190.
  it('Marathon: Z4-Obergrenze, 5 Schläge darüber zu hart', () => {
    expect(raceHr(42.195)).toEqual({ cap: athlete().raceHrCap, hard: athlete().raceHrCap + 5 })
    expect(raceHr(42.195).cap).toBe(Math.round(hrMax() * 0.85))
  })
  it('Halbmarathon 89 %, 10 km 92,5 % von HFmax; immer 5 Schläge Abstand, kürzer = höher', () => {
    expect(raceHr(21.0975)).toEqual({ cap: Math.round(hrMax() * 0.89), hard: Math.round(hrMax() * 0.89) + 5 })
    expect(raceHr(10)).toEqual({ cap: Math.round(hrMax() * 0.925), hard: Math.round(hrMax() * 0.925) + 5 })
    expect(raceHr(10).cap).toBeGreaterThan(raceHr(21.0975).cap)
    for (const d of [5, 10, 21.1, 42.2]) expect(raceHr(d).hard - raceHr(d).cap).toBe(5)
  })
})

// ─── HM block after Porto (logic audit 2026-10-26, findings 1–5) ──────────────
import { afterEach } from 'vitest'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import { allSessions, allWeeks, registerLiveBlocks } from '@/lib/plan/blocks'
import { planWeeks } from '@/lib/plan/effective'
import { weekReview } from '@/lib/insights/week'
import { decidePlan } from '@/lib/plan/race-day'
import { raceReadiness } from '@/lib/insights/readiness'
import { racePrediction } from '@/lib/insights/prediction'
import { fmtPace, paceToS } from '@/lib/plan/format'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import type { TrainingBlock } from '@/lib/plan/types'
import type { DatedRun } from '@/lib/plan/pace-check'

const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: 255, fiveKS: null, savedAt: null,
}
const hmGoal = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
const blockFrom = (id: string): TrainingBlock => {
  const t = listMethodologies().valid.find((m) => m.id === id)!.params
  const d = generateDraft({ goal: hmGoal, template: t, start: '2026-11-30', profile: RUNNER,
    measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft
  return freezeDraft(d, hmGoal, t.name, t)
}
const hm = blockFrom('pfitzinger-half')
// Every planned run done as planned: paced blocks at the given HR (Porto's October tests included).
const asRun = (hr: number) => (s: { date: string; km?: number; pace?: string; type: string }, i: number): DatedRun => ({
  id: `r${i}`, date: s.date, km: s.km!, paceS: s.pace ? paceToS(s.pace) : 345, avgHr: s.pace ? hr : 138,
  splitPacesS: Array.from({ length: Math.floor(s.km!) }, () => (s.pace ? paceToS(s.pace) : 345)),
  splitHrs: Array.from({ length: Math.floor(s.km!) }, () => (s.pace ? hr : 138)) })
afterEach(() => registerLiveBlocks([]))

describe('Wochen nach Porto (F1)', () => {
  it('planWeeks sieht den später registrierten Block; der Rückblick auf KW48 nennt die nächste Woche', () => {
    registerLiveBlocks([hm])
    expect(planWeeks().some((w) => w.start === '2026-11-30')).toBe(true)
    const kw48 = allWeeks().find((w) => w.start === '2026-11-23')!
    const r = weekReview({ week: kw48, today: '2026-11-29', sessions: allSessions(), runs: [], fitness: [], engineLog: [] })
    expect(r.focus).not.toContain('Renntag')
  })
})

describe('Der HM-Block spricht über den HM (F2–F4, F6)', () => {
  it('Renntag-Entscheidung nur aus HM-Tests: Porto-Tests mit HF 176 zählen nicht', () => {
    registerLiveBlocks([hm])
    const today = '2027-02-27'
    const sessions = allSessions().filter((s) => s.date < today)
    const porto = sessions.filter((s) => s.date < hm.planStart && s.type !== 'rest' && s.type !== 'race' && s.km).map(asRun(176))
    const own = sessions.filter((s) => s.date >= hm.planStart && s.type !== 'rest' && s.type !== 'race' && s.km).map(asRun(172))
    const d = decidePlan({ today, engineLog: [], sessions: allSessions(), runs: [...porto, ...own] })
    expect(hm.sessions.some((s) => s.test)).toBe(true)
    expect(d.kind).toBe('A')
    expect(d.reason).not.toMatch(/Porto|Hella/)
    // An HM test at HF 176 is on course for a half marathon (cap 178), not Plan B as with the marathon's 175.
    const d176 = decidePlan({ today, engineLog: [], sessions: allSessions(), runs: [...porto, ...own.map((r) => ({ ...r, avgHr: r.avgHr === 172 ? 176 : r.avgHr }))] })
    expect(d176.kind).toBe('A')
  })
  it('Bereitschaft und Prognose: Halbmarathon-Zahlen, keine Porto- oder Marathon-Texte', () => {
    registerLiveBlocks([hm])
    const today = '2027-02-20'
    const runs = allSessions().filter((s) => s.date < today && s.date >= hm.planStart && s.type !== 'rest' && s.type !== 'race' && s.km).map(asRun(172))
    const prediction = racePrediction({ today, sessions: allSessions(), runs })
    expect(prediction.timeS).toBeGreaterThan(75 * 60)
    expect(prediction.timeS).toBeLessThan(95 * 60)
    const r = raceReadiness({ today, sessions: allSessions(), runs, prediction, fitness: [{ date: today, ctl: 60, atl: 55, tsb: 5 }], acwr: 1 })
    const text = [...r.lines.map((l) => l.text), r.note ?? ''].join(' ')
    expect(text).not.toMatch(/Porto|Marathon|3:05|4:23|Hella/)
    expect(r.lines.find((l) => l.label === 'Längster Lauf')?.tone).toBe('ok')
  })
})

describe('Ein Renntempo je Block (F5, 2026-10-26: das trainierte Tempo)', () => {
  it('Norwegian mit Schwellentest: Renntempo-Einheiten, race.goalPaceS und paces.race sind dasselbe Tempo', () => {
    const b = blockFrom('norwegian-threshold-half')
    const race = fmtPace(b.race.goalPaceS)
    expect(b.paces!.race).toBe(race)
    expect(b.race.goalS).toBe(Math.round(b.race.goalPaceS * b.race.distanceKm))
    const tests = b.sessions.filter((s) => s.test)
    expect(tests.length).toBeGreaterThan(0)
    for (const t of tests) expect(t.pace, t.date).toBe(race)
  })
  it('aus der Zielzeit (Pfitzinger): Ziel bleibt die Saison-Zielzeit', () => {
    expect(hm.race.goalS).toBe(hmGoal.goalS)
  })
})
