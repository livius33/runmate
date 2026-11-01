// Minor races in a generated block (07-16 AC-1…AC-3): race day fixed, days around it easier or shorter, week ≤ planned,
// removing the race gives the frozen block back; Porto never changes.
import { afterEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDays, format, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { validateGoal, type SeasonGoal } from '@/lib/season/goals'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import { applyEvents, defaultRole, eventError, eventEffect, eventWarning, postEasyDays, preEasyDays, EVENT_RULES } from '@/lib/plan/events'
import { parseStructure } from '@/lib/plan/structure'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { checkDays } from './days-check'
import { checkWorkouts } from './workouts-check'
import type { PlanSession } from '@/lib/plan/types'
import { registerLiveBlocks } from '@/lib/plan/blocks'
import { effectiveSessions } from '@/lib/plan/effective'
import { EMPTY_ENGINE, runEngine } from '@/lib/plan/engine'

const RUNS = Number(process.env.FC_RUNS ?? 200)
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined
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

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const km = (s?: PlanSession) => (s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)
const at = (list: PlanSession[], d: string) => list.find((s) => s.date === d)
const hard = (s?: PlanSession) => !!s && (s.key || s.type === 'tempo' || s.type === 'intervals' || (s.type === 'long' && (s.km ?? 0) >= 25))
const race = (p: Partial<SeasonGoal> & Pick<SeasonGoal, 'date'>): SeasonGoal => ({
  id: `b-${p.date}`, kind: '10k', priority: 'B', name: 'Testlauf', confirmed: true, distanceKm: null, goalS: null, loops: null, ...p,
})

describe('Nebenrennen im generierten Block (AC-3)', () => {
  it('Porto bleibt, wie es ist (AC-1)', () => {
    expect(applyEvents(PORTO_2026, [race({ date: '2026-11-01' })])).toBe(PORTO_2026)
  })

  it('Rolle vorbelegt: ≤ 21 Tage vor dem HM Test, ab 8 km Aufbau (Pfitzinger, 07-18), sonst mitlaufen', () => {
    expect(defaultRole(race({ date: '2027-02-14' }), block)).toBe('test')
    expect(defaultRole(race({ date: '2027-01-17', kind: 'half' }), block)).toBe('build')
    expect(defaultRole(race({ date: '2027-01-17' }), block)).toBe('build')
    expect(defaultRole(race({ date: '2027-01-17', kind: '5k' }), block)).toBe('fun')
  })

  it('zu nah am Hauptrennen: abgelehnt; 10 km mit 10–13 Tagen Abstand: nur Warnung', () => {
    expect(eventError(race({ date: '2027-02-21' }), block)).toMatch(/Zu nah an/)
    expect(eventError(race({ date: '2027-02-17' }), block)).toBeNull()
    expect(eventWarning(race({ date: '2027-02-17' }), block)).toMatch(/Nur 11 Tage/)
    expect(applyEvents(block, [race({ date: '2027-02-21' })])).toEqual(block)
  })

  it('Aufbaurennen 10 km: Renntag fest, 2 Tage davor locker, 3 danach, Woche ohne weitere Schlüsseleinheit, leichte Woche nur ab 15 km', () => {
    const g = race({ date: '2027-01-17', role: 'build', goalS: 38 * 60 })
    const out = applyEvents(block, [g])
    const r = at(out.sessions, g.date)!
    expect(r).toMatchObject({ anchor: true, key: true, type: 'tempo', km: 15, pace: '3:48' })
    expect(parseStructure(r.notes)).not.toBeNull()
    for (let i = 1; i <= preEasyDays(10); i++) expect(hard(at(out.sessions, day(g.date, -i))), `−${i}`).toBe(false)
    for (let i = 1; i <= postEasyDays(10); i++) expect(hard(at(out.sessions, day(g.date, i))), `+${i}`).toBe(false)
    expect(km(at(out.sessions, day(g.date, -1)))).toBeLessThanOrEqual(EVENT_RULES.dayBeforeMaxKm)
    const w = out.weeks.find((x) => x.start <= g.date && g.date <= x.end)!
    expect(out.sessions.filter((s) => s.date >= w.start && s.date <= w.end && s.key && s.date !== g.date)).toEqual([])
    expect(w.light).toBeUndefined()
  })

  it('HM-Renntempo-Test 3 Wochen vorher: Testrennen im Zieltempo, leichte Woche', () => {
    const g = race({ date: '2027-02-07', kind: 'half', role: 'test' })
    const out = applyEvents(block, [g])
    expect(at(out.sessions, g.date)).toMatchObject({ test: 'Testrennen', pace: '4:02', km: 26.1, anchor: true })
    expect(out.weeks.find((x) => x.start <= g.date && g.date <= x.end)!.light).toBe(true)
  })

  it('5 km mitlaufen: lockerer Lauf statt der Einheit, nur der Tag davor ohne Qualität', () => {
    const g = race({ date: '2027-01-10', kind: '5k', role: 'fun' })
    const out = applyEvents(block, [g])
    expect(at(out.sessions, g.date)).toMatchObject({ type: 'easy', km: 5, anchor: true })
    expect(hard(at(out.sessions, day(g.date, -1)))).toBe(false)
    for (const s of out.sessions) if (s.date !== g.date && s.date !== day(g.date, -1)) expect(s).toEqual(at(block.sessions, s.date))
  })

  it('Wirkung in einem Satz je Rolle', () => {
    expect(eventEffect('test', 21.1)).toMatch(/Plan A\/B/)
    expect(eventEffect('build', 10)).toMatch(/3 danach/)
    expect(eventEffect('fun', 5)).toMatch(/Tag davor/)
  })

  it('Rolle nur für Nebenrennen, Testtempo im Rahmen', () => {
    const own = [race({ date: '2027-01-17' })]
    expect(validateGoal({ ...own[0], priority: 'A', role: 'test' }, [], '2026-10-25')).toMatch(/Nebenrennen/)
    expect(validateGoal({ ...own[0], paceS: 100 }, [], '2026-10-25')).toMatch(/Testtempo/)
  })
})

describe('Prüfungen des Generators (AC-3)', () => {
  it('drei Beispielrennen: Tage- und Einheitenprüfung melden nur die erwarteten Ausnahmen, nie eine Woche über dem Gerüst', () => {
    const goals = [race({ date: '2027-01-17', role: 'build' }), race({ date: '2027-02-07', kind: 'half', role: 'test' }), race({ date: '2027-01-03', kind: '5k', role: 'fun' })]
    const applied = applyEvents(block, goals)
    const raceWeekEnd = draft.days.weeks[draft.days.weeks.length - 1].end            // recovery weeks after the race: own tests (07-22)
    const out = { ...applied, sessions: applied.sessions.filter((s) => s.date <= raceWeekEnd), weeks: applied.weeks.filter((w) => w.end <= raceWeekEnd) }
    const base = { template, distance: 'half' as const, raceDate: hm.date, raceName: hm.name, profile: LIVIUS, goalS: 5100, recentRace: null }
    const days = checkDays({ ...draft.days, sessions: out.sessions }, draft.skeleton, { ...base, racePaceS: draft.paces.racePaceS, longest30Km: 16, longest12mKm: 42.2 })
    const work = checkWorkouts({ ...draft.workouts, sessions: out.sessions }, draft.days, draft.skeleton, base)
    // Expected: changed days (work), lower weeks (days), the long run returning to plan after a shortened race week.
    const raceWeeks = out.weeks.filter((w) => goals.some((g) => g.date >= w.start && g.date <= w.end)).map((w) => w.kw)
    const after = new Set(raceWeeks.map((kw) => `KW ${out.weeks[out.weeks.findIndex((w) => w.kw === kw) + 1]?.kw}:`))
    expect(work.filter((x) => !/Tag geändert/.test(x))).toEqual([])
    expect(days.filter((x) => !/ohne Hinweis/.test(x) && !(/Longrun \+/.test(x) && after.has(x.split(' ').slice(0, 2).join(' '))))).toEqual([])
  })
})

describe('Eigenschaften (AC-3)', () => {
  const arb = fc.array(fc.record({
    offset: fc.integer({ min: 0, max: 85 }), kind: fc.constantFrom('5k' as const, '10k' as const, 'half' as const),
    role: fc.constantFrom(undefined, 'test' as const, 'build' as const, 'fun' as const),
  }), { minLength: 1, maxLength: 3 })
  it('kein Tag mehr km (außer Renntag), keine härteren Tage, Renntage fest, Woche ≤ Plan, ohne Rennen = eingefroren', () => {
    fc.assert(fc.property(arb, (list) => {
      const dates = new Set<string>()
      const goals = list.map((x) => race({ date: day(block.planStart, x.offset), kind: x.kind, role: x.role }))
        .filter((g) => !dates.has(g.date) && dates.add(g.date))
      const out = applyEvents(block, goals)
      const raceDays = new Set(goals.filter((g) => !eventError(g, block)).map((g) => g.date))
      for (const s of out.sessions) {
        const b = at(block.sessions, s.date)
        if (raceDays.has(s.date)) { expect(s.anchor).toBe(true); continue }
        expect(km(s), s.date).toBeLessThanOrEqual(km(b) + 1e-9)
        if (!hard(b)) expect(hard(s), s.date).toBe(false)
        if (b?.anchor) expect(s).toEqual(b)
      }
      for (const w of out.weeks) {
        if (![...raceDays].some((d) => d >= w.start && d <= w.end)) continue
        const sum = (l: PlanSession[]) => l.filter((s) => s.date >= w.start && s.date <= w.end).reduce((t, s) => t + km(s), 0)
        const nonFixedMin = out.sessions.filter((s) => s.date >= w.start && s.date <= w.end && !raceDays.has(s.date) && km(s) > EVENT_RULES.minRunKm).length
        if (nonFixedMin) expect(sum(out.sessions)).toBeLessThanOrEqual(sum(block.sessions) + 1e-9)
      }
      expect(applyEvents(block, [])).toBe(block)
      return true
    }), { numRuns: RUNS, seed })
  })
})

describe('Plan und Engine (AC-4)', () => {
  afterEach(() => registerLiveBlocks([]))
  const build = race({ date: '2027-01-17', role: 'build' })
  const test = race({ date: '2027-02-07', kind: 'half', role: 'test' })

  it('veraltete Engine-Änderung auf dem Renntag zählt nicht; eigene Änderungen an angepassten Tagen gewinnen', () => {
    registerLiveBlocks([applyEvents(block, [build])])
    const stale = { [build.date]: { date: build.date, type: 'easy' as const, km: 12, title: 'Lockerer Lauf' } }
    const mine = { [day(build.date, -1)]: { date: day(build.date, -1), type: 'rest' as const, title: 'Ruhetag' } }
    const eff = effectiveSessions(mine, stale)
    expect(at(eff, build.date)).toMatchObject({ type: 'tempo', anchor: true, title: build.name })
    expect(at(eff, day(build.date, -1))?.type).toBe('rest')
  })

  it('leichte Woche (HM-Test): die Engine schiebt nichts hinein und gleicht nichts aus', () => {
    const applied = applyEvents(block, [test])
    const week = applied.weeks.find((w) => w.start <= test.date && test.date <= w.end)!
    expect(week.light).toBe(true)
    registerLiveBlocks([applied])
    for (let d = week.start; d <= week.end; d = day(d, 1)) {
      const added = runEngine({ today: d, at: `${d}T07:00:00Z`, manual: {}, state: EMPTY_ENGINE, runs: [], fitness: { tsb: 0, acwr: 1 } }).added
      const inWeek = added.filter((c) => Object.keys(c.after).some((x) => x >= week.start && x <= week.end))
      expect(inWeek, d).toEqual([])
    }
  })
})
