// Own method without a template (07-19): neutral bases from the research, every field settable, checked like a template
// file, and the same pipeline (draft → freeze → engine rules) as any book method.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { listMethodologies, listOwnBases } from '@/lib/plan/methodology/load'
import { buildOwn, isOwn, ownFields, ownValue } from '@/lib/plan/methodology/own'
import { tuneFields, type Tuning } from '@/lib/plan/methodology/tune'
import { PHASES, type Distance } from '@/lib/plan/methodology/schema'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import { rulesFromTemplate } from '@/lib/plan/rules'
import type { SeasonGoal } from '@/lib/season/goals'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { checkSkeleton } from './skeleton-check'
import { checkDays } from './days-check'
import { checkWorkouts } from './workouts-check'

const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const GOALS: Record<Distance, SeasonGoal> = {
  '10k': { id: '10k-2027', kind: '10k', priority: 'A', name: '10 km 2027', date: '2027-02-21', confirmed: false, distanceKm: null, goalS: 37 * 60, loops: null },
  half: { id: 'hm-2027', kind: 'half', priority: 'A', name: 'HM 2027', date: '2027-02-28', confirmed: false, distanceKm: null, goalS: 5100, loops: null },
  marathon: { id: 'm-2027', kind: 'marathon', priority: 'A', name: 'Marathon 2027', date: '2027-04-25', confirmed: false, distanceKm: null, goalS: 3 * 3600 + 2 * 60, loops: null },
}
const measured = { currentKm: 55, currentKmSource: 'recoveryBlock' as const, provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null }
const BASES = listOwnBases()
const base = (d: Distance) => BASES.valid.find((m) => m.params.distances[0] === d)!.params
const draftFor = (d: Distance, values: Tuning, start = '2026-11-30') => {
  const r = buildOwn(base(d), values)
  if (!r.ok) throw new Error(r.errors.join('; '))
  return { template: r.template, draft: generateDraft({ goal: GOALS[d], template: r.template, start, profile: RUNNER, measured }) }
}
// Every check the generator's own tests use, on one draft.
function checks(d: Draft, template: ReturnType<typeof base>, distance: Distance, start: string) {
  const goal = GOALS[distance]
  const io = { template, distance, raceDate: goal.date, raceName: goal.name, profile: RUNNER, goalS: goal.goalS!, recentRace: null }
  return [
    ...checkSkeleton(d.skeleton, { ...io, start, currentKm: measured.currentKm, currentKmSource: measured.currentKmSource, provenKm: measured.provenKm, experience: 'advanced', age: 40 }),
    ...checkDays({ ...d.days, sessions: d.workouts.sessions }, d.skeleton, { ...io, racePaceS: d.paces.racePaceS, longest30Km: measured.longest30Km, longest12mKm: measured.longest12mKm }),
    ...checkWorkouts(d.workouts, d.days, d.skeleton, io),
  ]
}

describe('Neutrale Grundlage (AC-1)', () => {
  it('drei gültige Grundlagen, eine je Strecke, keine Buchvorlage', () => {
    expect(BASES.invalid).toEqual([])
    expect(BASES.valid.map((m) => m.params.distances)).toEqual([['10k'], ['half'], ['marathon']])
    expect(BASES.valid.every((m) => isOwn(m.id))).toBe(true)
    expect(listMethodologies().valid.some((m) => isOwn(m.id))).toBe(false)
  })
  it('jeder Wert des Schemas ist einstellbar (außer Werten anderer Strecken und Auslösern, die die Engine nicht liest)', () => {
    for (const d of ['10k', 'half', 'marathon'] as const) {
      const m = base(d)
      const fields = new Set(ownFields(m).map((f) => f.path))
      const leaves: string[] = []
      const walk = (o: unknown, p: string) => {
        if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k)
        else leaves.push(p)
      }
      walk(m, '')
      const other = ['10k', 'half', 'marathon'].filter((x) => x !== d).join('|')
      const skip = new RegExp(`^(id|version|name|summary|distances|sources|workouts)\\b|\\.(${other})\\b|^adaptation\\.triggers\\.(?!fatigue_tsb)`)
      expect(leaves.filter((l) => !skip.test(l) && !fields.has(l)), d).toEqual([])
      // workouts: every kind of the base on/off in every phase; "Mein Ansatz" fields are all there too
      for (const p of PHASES) for (const w of m.workouts[p]) expect(fields.has(`workouts.${p}.${w.kind}`)).toBe(true)
      for (const f of tuneFields(m)) expect(fields.has(f.path), f.path).toBe(true)
    }
  })
  it('falsche Werte: Feld + Grund, kein Plan', () => {
    const r = buildOwn(base('half'), { 'intensity.build.easy': 0.5, 'phases.taper.volume.1': 0.7, 'week.runs': 20, 'workouts.peak.test': 'x' as unknown as boolean })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual(['Läufe pro Woche: 2–14, ganze Zahl', 'Spitze: Test / Vorbereitungsrennen: ja oder nein'])
    const sum = buildOwn(base('half'), { 'intensity.build.easy': 0.5, 'phases.taper.volume.1': 0.7 })
    expect(sum.ok).toBe(false)
    if (sum.ok) return
    expect(sum.errors).toEqual(['Intensität Aufbau: Summe 0,68 – muss 1 sein', 'Taper: Rennwoche 70 % über der Sicherheitsgrenze 60 %'])
    const pace = buildOwn(base('marathon'), { 'paces.offsets.intervals_vo2': 0, 'paces.offsets.long': -5 })
    expect(pace.ok ? [] : pace.errors).toEqual(['Tempo Longrun: langsamer als das Renntempo (über 0 s/km)', 'Tempo VO2max: schneller als Renntempo und Schwelle'])
  })
  // Property counterexamples: two paced kinds on one pace — an 8 km marathon-pace run at threshold pace read as threshold, over its cap.
  it('zwei Einheitenarten im selben Tempo werden abgelehnt (Gegenbeispiele 07-19)', () => {
    const values: Tuning = {
      'week.key_sessions.peak': 0, 'phases.taper.weeks.marathon': 1, 'workouts.build.intervals_vo2': false, 'workouts.peak.threshold': false,
      'workouts.peak.marathon_pace': false, 'workouts.peak.intervals_vo2': false, 'paces.offsets.threshold': 0,
      ...Object.fromEntries(PHASES.flatMap((p) => [[`intensity.${p}.easy`, 0.6], [`intensity.${p}.moderate`, 0], [`intensity.${p}.hard`, 0.4]])),
    }
    const same = (a: string, b: string) => `Tempo ${a} und ${b}: gleich – die Einheiten wären nicht zu unterscheiden`
    const errors = (d: Distance, v: Tuning) => { const r = buildOwn(base(d), v); return r.ok ? [] : r.errors }
    expect(errors('marathon', values)).toEqual([same('Schwelle', 'Marathontempo')])
    expect(errors('marathon', { 'paces.offsets.marathon_pace': -38 })).toEqual([same('Marathontempo', 'VO2max')])
    expect(errors('half', { 'workouts.build.threshold': false, 'workouts.peak.threshold': false, 'paces.offsets.half_marathon_pace': -5 })).toEqual([same('Schwelle', 'HM-Tempo')])
    expect(errors('half', { 'paces.offsets.half_marathon_pace': -22 })).toEqual([same('VO2max', 'HM-Tempo')])
    expect(errors('10k', { 'paces.offsets.threshold': 0 })).toEqual([same('Renntempo', 'Schwelle')])
    // Paces of kinds the plan does not use may coincide (the marathon base has HM pace = threshold, like Pfitzinger).
    expect(base('marathon').paces.offsets.half_marathon_pace).toBe(base('marathon').paces.offsets.threshold)
    expect(errors('half', { 'paces.offsets.threshold': 15 })).toEqual([])
    // A threshold just off race pace still drafts cleanly.
    const ok = buildOwn(base('marathon'), { ...values, 'paces.offsets.threshold': -1 })
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    const draft = generateDraft({ goal: GOALS.marathon, template: ok.template, start: '2027-02-28', profile: RUNNER, measured })
    expect(draft.ok).toBe(true)
    if (!draft.ok) return
    expect(checks(draft, ok.template, 'marathon', draft.skeleton.weeks[0].start)).toEqual([])
  })
})

describe('Gleiche Pipeline wie eine Buchvorlage (AC-2)', () => {
  it('ohne eigene Werte: Entwurf je Strecke besteht alle Prüfungen; Name, Einheiten und Tempo aus den Werten', () => {
    for (const d of ['10k', 'half', 'marathon'] as const) {
      const { template, draft } = draftFor(d, {})
      expect('ok' in draft && draft.ok, d).toBe(true)
      expect(checks(draft as Draft, template, d, '2026-11-30'), d).toEqual([])
    }
    const named = buildOwn(base('half'), { 'workouts.build.hills': true, 'workouts.peak.test': false, 'paces.offsets.threshold': -8 }, 'Mein HM-Weg')
    expect(named.ok && named.template.name).toBe('Mein HM-Weg')
    if (!named.ok) return
    expect(ownValue(named.template, 'workouts.build.hills')).toBe(true)
    expect(ownValue(named.template, 'workouts.peak.test')).toBe(false)
    expect(named.template.workouts.build.find((w) => w.kind === 'hills')).toEqual(base('half').workouts.base.find((w) => w.kind === 'hills'))
    expect(named.template.paces.offsets.threshold).toBe(-8)
  })
  it('eingefroren: Engine-Regeln, Nebenrennen und Rückkehr kommen aus der eigenen Methode', () => {
    const values = { 'adaptation.thresholds.tsb_fatigue': -30, 'adaptation.events.pre_easy_days.short': 1, 'adaptation.return.week1_share': 0.6 }
    const { template, draft } = draftFor('half', values)
    const block = freezeDraft(draft as Draft, GOALS.half, 'Eigene Methode', template)
    expect(block.engine).toMatchObject(rulesFromTemplate(template))
    expect(block.engine).toMatchObject({ tsbRed: -30, events: { preEasy: { short: 1 } }, return: { week1Share: 0.6 } })
  })

  // Random valid own methods: shares that add up, ranges in order, everything else anywhere in its field range.
  const caseArb = (d: Distance) => {
    const m = base(d)
    const fields = ownFields(m).filter((f) => !/^(intensity|phases\.split|volume\.phases|phases\.shorten_order)\./.test(f.path))
    const pick = fc.subarray(fields, { maxLength: 12 }).chain((fs) => fc.tuple(...fs.map((f) =>
      f.kind === 'bool' ? fc.boolean() : f.kind === 'choice' ? fc.constantFrom(...f.options!.map((o) => o.value))
        : f.kind === 'int' ? fc.integer({ min: f.min, max: f.max })
          : fc.integer({ min: Math.round(f.min * 100), max: Math.round(f.max * 100) }).map((n) => n / 100))).map((vs) => Object.fromEntries(fs.map((f, i) => [f.path, vs[i]]))))
    const three = fc.tuple(fc.integer({ min: 60, max: 95 }), fc.integer({ min: 0, max: 100 })).map(([e, m2]) => {
      const mod = Math.round(((100 - e) * m2) / 100)
      return [e / 100, mod / 100, (100 - e - mod) / 100]
    })
    const intensity = fc.tuple(three, three, three, three).map((ps) => Object.fromEntries(PHASES.flatMap((p, i) =>
      (['easy', 'moderate', 'hard'] as const).map((z, j) => [`intensity.${p}.${z}`, ps[i][j]]))))
    const split = fc.tuple(fc.integer({ min: 15, max: 50 }), fc.integer({ min: 15, max: 50 })).map(([b, u]) => ({ 'phases.split.base': b / 100, 'phases.split.build': u / 100, 'phases.split.peak': (100 - b - u) / 100 }))
    const ranges = fc.array(fc.tuple(fc.integer({ min: 40, max: 100 }), fc.integer({ min: 40, max: 100 })), { minLength: 3, maxLength: 3 })
      .map((rs) => Object.fromEntries((['base', 'build', 'peak'] as const).flatMap((p, i) => [[`volume.phases.${p}.0`, Math.min(...rs[i]) / 100], [`volume.phases.${p}.1`, Math.max(...rs[i]) / 100]])))
    return fc.record({ pick, intensity: fc.option(intensity, { nil: undefined }), split: fc.option(split, { nil: undefined }), ranges: fc.option(ranges, { nil: undefined }),
      weeks: fc.integer({ min: 8, max: 24 }) })
  }
  for (const d of ['10k', 'half', 'marathon'] as const) {
    it(`${d}: zufällige gültige eigene Methoden – Entwürfe bestehen Gerüst-, Tage-, Einheiten- und Sicherheitsprüfung`, () => {
      let generated = 0
      fc.assert(fc.property(caseArb(d), (c) => {
        const values: Tuning = { ...c.pick, ...c.intensity, ...c.split, ...c.ranges }
        const r = buildOwn(base(d), values)
        fc.pre(r.ok)
        if (!r.ok) return
        const goal = GOALS[d]
        const start = new Date(Date.parse(goal.date) - c.weeks * 7 * 864e5).toISOString().slice(0, 10)
        const draft = generateDraft({ goal, template: r.template, start, profile: RUNNER, measured })
        if (!draft.ok) { expect(draft.error).toMatch(/\S/); return }        // a German reason, never a throw
        generated++
        const monday = draft.skeleton.weeks[0].start
        expect(checks(draft, r.template, d, monday)).toEqual([])
      }), { numRuns: 150 })
      expect(generated).toBeGreaterThan(50)
    })
  }
})
