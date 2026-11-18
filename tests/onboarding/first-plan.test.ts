// A new runner without any run (11-01): what they tell us in the onboarding carries the first plan. Unknown is not
// zero (methodologies/research/long-run.md 2.3).
import { describe, expect, it } from 'vitest'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { measureInputs } from '@/lib/plan/generator/inputs'
import { longShare } from '@/lib/plan/generator/days'
import { trainingPaces } from '@/lib/plan/generator/paces'
import { baseBlocks } from '@/lib/plan/base-block'
import { dataCheck } from '@/lib/plan/rebuild'
import { statedLongestKm, validProfile, type AthleteProfile } from '@/lib/plan/athlete-profile'
import { HRMAX_ESTIMATE_NOTE, buildProfiles, type ProfileInput } from '@/lib/onboarding/profile'
import type { SeasonGoal } from '@/lib/season/goals'

const template = (id: string) => listMethodologies().valid.find((m) => m.id === id)!.params
const TODAY = '2026-11-18'
const START = '2026-11-23'
const NEW: AthleteProfile = {
  v: 1, age: 34, weightKg: null, heightCm: null, experience: null, weeklyKm: 30, longestRunKm: 12,
  availableDays: [1, 2, 4, 6, 7], longRunDay: 7, qualityDays: [2, 4], kbDays: [], restDay: 3,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: null, thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const HM: SeasonGoal = { id: 'g', kind: 'half', priority: 'A', name: 'Frühjahrs-Halbmarathon', date: '2027-04-11', confirmed: true, distanceKm: null, goalS: 115 * 60, loops: null }
const measure = (profile: AthleteProfile | null, runs: { date: string; distanceM: number; durationS: number }[] = []) =>
  measureInputs({ runs, plan: [], weeks: [], today: TODAY, start: START, distance: 'half', profile })
const longRuns = (d: Draft) => d.workouts.sessions.filter((s) => s.type === 'long').map((s) => s.km ?? 0)
const draft = (profile: AthleteProfile) =>
  generateDraft({ goal: HM, template: template('daniels-half'), start: START, profile, measured: measure(profile), overrides: { currentKm: 30 } }) as Draft

describe('Längster Lauf ohne gemessene Läufe', () => {
  it('die eigene Angabe, sonst Wochenumfang ÷ Lauftage, sonst nichts', () => {
    expect(statedLongestKm(NEW)).toEqual({ km: 12, source: 'profile' })
    expect(statedLongestKm({ ...NEW, longestRunKm: null })).toEqual({ km: 6, source: 'estimate' })
    expect(statedLongestKm({ ...NEW, longestRunKm: null, weeklyKm: null })).toBeNull()
    expect(statedLongestKm(null)).toBeNull()
  })

  it('Messwerte: Profil nur, solange kein Lauf bekannt ist', () => {
    expect(measure(NEW)).toMatchObject({ longest30Km: 12, longest30Source: 'profile' })
    expect(measure({ ...NEW, longestRunKm: null })).toMatchObject({ longest30Km: 6, longest30Source: 'estimate' })
    expect(measure(null)).toMatchObject({ longest30Km: 0, longest30Source: 'none' })
    // A run in the window wins, also a shorter one …
    expect(measure(NEW, [{ date: '2026-11-10', distanceM: 8000, durationS: 2880 }])).toMatchObject({ longest30Km: 8, longest30Source: 'measured' })
    // … and an old run makes the gap a measured break: the long run starts carefully.
    expect(measure(NEW, [{ date: '2026-08-01', distanceM: 15000, durationS: 5400 }])).toMatchObject({ longest30Km: 0, longest30Source: 'none' })
  })

  it('erster Plan: 30 km auf 5 Tagen, längster Lauf 12 km → Longrun ab 12 km bis in den Halbmarathon-Bereich', () => {
    const d = draft(NEW)
    expect(d.ok).toBe(true)
    const longs = longRuns(d)
    expect(longs[0]).toBe(12)                              // their own longest run: 40 % of the week, not the template's 25 %
    expect(Math.max(...longs)).toBe(14.5)                  // long-run.md 1.3; 10 km under the plain share rule
    const week1 = d.workouts.sessions.filter((s) => s.date < '2026-11-30' && s.type !== 'rest' && (s.km ?? 0) > 0)
    expect(week1.map((x) => x.km)).toEqual([6, 6, 6, 12])  // four runs of a real length rather than five short ones
    expect(d.warnings.map((w) => w.text)).toContain('Längster Lauf 14,5 km – für einen Halbmarathon knapp.')
    expect(d.inputs.longest30Km).toEqual({ value: 12, measured: 12, override: false })
    expect(d.inputs.longest30Source).toBe('profile')
  })

  it('Longrun-Anteil: Vorlage ab 64 km, darunter steigend bis 40 % bei 32 km', () => {
    expect(longShare(0.25, 80)).toBe(0.25)
    expect(longShare(0.25, 64)).toBe(0.25)
    expect(longShare(0.25, 48)).toBeCloseTo(0.325)
    expect(longShare(0.25, 32)).toBeCloseTo(0.4)
    expect(longShare(0.25, 12)).toBeCloseTo(0.4)
    expect(longShare(0.4, 40)).toBeCloseTo(0.4)
  })

  it('ohne Angabe: der Schnittlauf der Woche als Start, nicht der kürzeste Lauf', () => {
    const longs = longRuns(draft({ ...NEW, longestRunKm: null }))
    expect(longs[0]).toBe(6)
    expect(Math.max(...longs)).toBeGreaterThan(12)
  })

  it('Datencheck nennt die Herkunft', () => {
    const base = { km: 30, source: 'runs2' as const, runsKm: 30, beforeKm: null, pauseDays: null, share: null, text: '' }
    const check = (m: ReturnType<typeof measure>) => dataCheck({ runs: [], today: TODAY, base, measured: m, profile: NEW }).long
    expect(check(measure(NEW))).toMatchObject({ state: 'good', km: 12, text: expect.stringContaining('laut deinem Profil') })
    expect(check(measure({ ...NEW, longestRunKm: null }))).toMatchObject({ state: 'missing', km: 6, text: expect.stringContaining('geteilt durch deine Lauftage') })
    expect(check(measure(null))).toMatchObject({ state: 'missing', km: 0 })
  })

  it('Grundlage ohne Ziel: Longrun aus der Angabe, nur ohne jeden Lauf', () => {
    const p = { ...NEW, weeklyKm: 40 }
    const settings = { v: 1 as const, paused: false, capKm: null, start: START }
    const [b] = baseBlocks({ blocks: [], runs: [], today: TODAY, profile: p, settings })
    const longs = b.sessions.filter((s) => s.type === 'long').map((s) => s.km ?? 0)
    expect(longs.length).toBeGreaterThan(0)
    expect(longs[0]).toBe(13)                              // 110 % of 12 km; the share at 40 km/week (36 %) would allow 14.5
    // No race time in the profile: no session at a made-up threshold pace, strides instead – and the rules say so.
    expect(b.sessions.some((s) => s.type === 'tempo')).toBe(false)
    expect(b.sessions.some((s) => s.title === 'Grundlage: locker mit Steigerungen')).toBe(true)
    expect(b.rules.join(' ')).toContain('Noch kein Schwellentempo bekannt')
    const [paced] = baseBlocks({ blocks: [], runs: [], today: TODAY, profile: { ...p, thresholdPaceS: 330 }, settings })
    expect(paced.sessions.find((s) => s.type === 'tempo')?.pace).toBe('5:30')
    const [none] = baseBlocks({ blocks: [], runs: [], today: TODAY, profile: { ...p, longestRunKm: null, weeklyKm: null }, settings })
    expect(none.sessions.some((s) => s.type === 'long')).toBe(false)
    const [old] = baseBlocks({ blocks: [], runs: [{ date: '2026-08-01', km: 15 }], today: TODAY, profile: p, settings })
    expect(old.sessions.some((s) => s.type === 'long')).toBe(false)
  })
})

describe('Profil-Schritt', () => {
  const INPUT: ProfileInput = {
    hrMax: 188, hrMaxUnknown: false, age: null, hrRest: 52, race: null, weightKg: null, timezone: 'Europe/Berlin',
    weeklyKm: 30, longestRunKm: 12, experience: null, runDays: [1, 2, 4, 6, 7], longRunDay: 7,
  }
  it('HFmax leer: aus dem Alter geschätzt mit Hinweis, ohne Alter ein Fehler – nie still der Beispielwert', () => {
    const r = buildProfiles({ ...INPUT, hrMax: null, age: 34 })
    expect(r.ok && r.user.hrMax).toBe(184)
    expect(r.ok && r.notes).toEqual([HRMAX_ESTIMATE_NOTE])
    expect(buildProfiles({ ...INPUT, hrMax: null, age: null })).toMatchObject({ ok: false, error: expect.stringContaining('HFmax fehlt') })
    const known = buildProfiles(INPUT)
    expect(known.ok && [known.user.hrMax, known.notes]).toEqual([188, []])
  })
  it('längster Lauf: gespeichert, höchstens der Wochenumfang, 1–60 km', () => {
    const r = buildProfiles(INPUT)
    expect(r.ok && r.athlete.longestRunKm).toBe(12)
    expect(r.ok && validProfile(r.athlete)).toBe(true)
    expect(buildProfiles({ ...INPUT, longestRunKm: 31 })).toMatchObject({ ok: false, error: expect.stringContaining('nicht länger') })
    expect(buildProfiles({ ...INPUT, weeklyKm: 200, longestRunKm: 61 })).toMatchObject({ ok: false, error: expect.stringContaining('1–60') })
    expect(buildProfiles({ ...INPUT, longestRunKm: 0 })).toMatchObject({ ok: false })
    const empty = buildProfiles({ ...INPUT, longestRunKm: null })
    expect(empty.ok && empty.athlete.longestRunKm).toBeNull()
    // A form that does not know the field keeps the stored answer.
    const { longestRunKm: _, ...old } = INPUT
    const kept = buildProfiles(old, r.ok ? r.athlete : null)
    expect(kept.ok && kept.athlete.longestRunKm).toBe(12)
  })
})

describe('Tempo-Hinweise: einer je Herkunft', () => {
  const base = { distance: 'half' as const, goalS: 115 * 60, profile: NEW }
  it('VDOT-Vorlage ohne Wettkampf: ein Hinweis, kein interner Text', () => {
    const p = trainingPaces({ ...base, template: template('daniels-half') })
    expect(p.source).toBe('goal_time')
    expect(p.warnings).toEqual(['Kein Wettkampf aus den letzten 6 Monaten: die Tempi kommen aus deiner Zielzeit. Ein Testlauf in Woche 2–3 zeigt, ob sie passen.'])
  })
  it('mit Wettkampf: die Herkunft in einem Satz', () => {
    const p = trainingPaces({ ...base, template: template('daniels-half'), recentRace: { distanceKm: 10, timeS: 52 * 60, date: '2026-10-04' } })
    expect(p.source).toBe('race')
    expect(p.warnings.filter((w) => w.includes('Tempi'))).toEqual(['Tempi aus deinem letzten Wettkampf, auf die Zieldistanz umgerechnet (Riegel-Formel).'])
    expect(p.warnings.join(' ')).not.toContain('fehlen noch')
  })
  it('keine Vorlage sagt zweimal, dass die Tempi aus der Zielzeit kommen', () => {
    for (const m of listMethodologies().valid.filter((x) => x.params.distances.includes('half'))) {
      const w = trainingPaces({ ...base, template: m.params }).warnings.filter((x) => x.includes('Zielzeit'))
      expect(w.length, m.id).toBeLessThanOrEqual(1)
    }
  })
})
