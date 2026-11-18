// Method-aware adaptation (07-18): minor races and the return after Krank/Pause follow the block's methodology; a
// template without the new values (Porto, blocks frozen before 07-18) behaves exactly as before.
import { afterEach, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDays, format, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { OPTIONAL_DEFAULTS, tuneTemplate } from '@/lib/plan/methodology/tune'
import { checkSafety } from '@/lib/plan/methodology/safety'
import { type SeasonGoal } from '@/lib/season/goals'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import { applyEvents, defaultRole, EVENT_RULES, eventRules, preEasyDays } from '@/lib/plan/events'
import { RETURN_RULES, pauseLayer } from '@/lib/plan/pause'
import { DEFAULT_RULES, rulesFromTemplate } from '@/lib/plan/rules'
import { allSessions, registerLiveBlocks } from '@/lib/plan/blocks'
import { EMPTY_ENGINE, runEngine, undoChange } from '@/lib/plan/engine'
import { effectiveSessions } from '@/lib/plan/effective'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import type { PlanSession, TrainingBlock } from '@/lib/plan/types'
import { portoTemplate } from '@/examples/porto-2026/template'

const RUNS = Number(process.env.FC_RUNS ?? 100)
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined
const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
const templates = listMethodologies().valid
const blockFrom = (id: string): TrainingBlock => {
  const t = templates.find((m) => m.id === id)!
  const draft = generateDraft({ goal: hm, template: t.params, start: '2026-11-30', profile: RUNNER,
    measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft
  return freezeDraft(draft, hm, t.params.name, t.params)
}
const HALF = templates.filter((m) => m.params.distances.includes('half')).map((m) => m.id)
const blocks = Object.fromEntries(HALF.map((id) => [id, blockFrom(id)]))

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const km = (s?: PlanSession) => (s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)
const at = (list: PlanSession[], d: string) => list.find((s) => s.date === d)
const hard = (s?: PlanSession) => !!s && (s.key || s.type === 'tempo' || s.type === 'intervals')
const race = (p: Partial<SeasonGoal> & Pick<SeasonGoal, 'date'>): SeasonGoal => ({
  id: `b-${p.date}`, kind: '10k', priority: 'B', name: 'Testlauf', confirmed: true, distanceKm: null, goalS: null, loops: null, ...p,
})
afterEach(() => registerLiveBlocks([]))

describe('Vorlage ohne neue Werte: alles wie vorher (AC-1)', () => {
  it('die Standardwerte der Vorlage sind die Konstanten von events.ts und pause.ts', () => {
    const d = OPTIONAL_DEFAULTS
    expect([d['adaptation.events.pre_easy_days.short'], d['adaptation.events.pre_easy_days.half'], d['adaptation.events.pre_easy_days.long']])
      .toEqual([EVENT_RULES.preEasy.short, EVENT_RULES.preEasy.half, EVENT_RULES.preEasy.long])
    expect(d['adaptation.events.post_easy.per_km']).toBe(EVENT_RULES.postPerKm)
    expect(d['adaptation.events.post_easy.min']).toBe(EVENT_RULES.postMin)
    expect(d['adaptation.events.build_from_km']).toBe(EVENT_RULES.buildMinKm)
    expect(d['adaptation.events.test_window_days']).toBe(EVENT_RULES.testDaysBefore)
    expect(d['adaptation.events.light_from_km']).toBe(EVENT_RULES.lightMinKm)
    expect([d['adaptation.return.week1_share'], d['adaptation.return.week2_share'], d['adaptation.return.week2_quality'], d['adaptation.return.long_share']])
      .toEqual([RETURN_RULES.week1Share, RETURN_RULES.week2Share, RETURN_RULES.week2Quality, RETURN_RULES.longShare])
  })
  it('Porto-Vorlage und Porto-Regeln tragen keine neuen Werte', () => {
    const porto = portoTemplate().params
    const r = rulesFromTemplate(porto)
    expect(r.events).toBeUndefined()
    expect(r.return).toBeUndefined()
    expect(r.taperDays).toBeUndefined()
    expect(DEFAULT_RULES.taperDays).toBeUndefined()
  })
  it('ein vor 07-18 eingefrorener Block (ohne neue Werte) rechnet mit den Konstanten', () => {
    const old = { ...blocks['pfitzinger-half'], engine: { ...blocks['pfitzinger-half'].engine!, events: undefined, return: undefined, taperDays: undefined } }
    expect(eventRules(old)).toEqual(EVENT_RULES)
  })
})

describe('Methoden unterscheiden sich, wo die Recherche es sagt (AC-3)', () => {
  it('Taper-Schutz aus der Vorlage: Wochen × 7', () => {
    for (const id of HALF) {
      const t = templates.find((m) => m.id === id)!.params
      expect(blocks[id].engine!.taperDays, id).toBe(Math.max(7, 7 * t.phases.taper.weeks.half!))
    }
  })
  it('10 km sechs Wochen vor dem HM: Pfitzinger schlägt Aufbaurennen vor, Polarized mitlaufen', () => {
    const g = race({ date: '2027-01-17' })
    expect(defaultRole(g, blocks['pfitzinger-half'])).toBe('build')
    expect(defaultRole(g, blocks['polarized-80-20-half'])).toBe('fun')
  })
  it('Daniels: ein lockerer Tag vor einem 10-km-Aufbaurennen, Pfitzinger zwei', () => {
    expect(preEasyDays(10, eventRules(blocks['daniels-half']))).toBe(1)
    expect(preEasyDays(10, eventRules(blocks['pfitzinger-half']))).toBe(2)
  })
  it('Norwegian: ein 15-km-Rennen macht die Woche nicht leicht, bei Pfitzinger schon', () => {
    const g = race({ date: '2027-01-17', kind: 'other', distanceKm: 15, role: 'build' })
    const light = (id: string) => applyEvents(blocks[id], [g]).weeks.find((w) => w.start <= g.date && g.date <= w.end)!.light
    expect(light('norwegian-threshold-half')).toBeUndefined()
    expect(light('pfitzinger-half')).toBe(true)
  })
  it('Rückkehr nach Krank: Polarized ohne Qualität in Woche 2, Pfitzinger mit Schwelle', () => {
    const week2 = (id: string) => {
      registerLiveBlocks([blocks[id]])
      const byDate = new Map(allSessions().map((s) => [s.date, s]))
      const layer = pauseLayer(byDate, { pauses: [{ id: 'p', kind: 'krank', from: '2027-01-04', to: '2027-01-10' }], today: '2027-01-11' })
      const w = layer.windows[0]
      return Object.values(layer.caps).filter((s) => s.date > w.week1End && s.date <= w.until)
    }
    expect(week2('polarized-80-20-half').filter(hard)).toEqual([])
    expect(week2('pfitzinger-half').some(hard)).toBe(true)
  })
})

describe('Sicherheitsgrenzen gelten für jede Vorlage', () => {
  it('Mein Ansatz kann Rückkehr-Anteile nicht über die Grenze setzen', () => {
    const t = templates.find((m) => m.id === 'pfitzinger-half')!.params
    expect(tuneTemplate(t, { 'adaptation.return.week1_share': 0.8 }).ok).toBe(true)
    expect(checkSafety({ ...t, adaptation: { ...t.adaptation, return: { week1_share: 0.85 } } }).map((i) => i.path)).toContain('adaptation.return.week1_share')
    const one = tuneTemplate(t, { 'adaptation.events.pre_easy_days.half': 2 })
    expect(one.ok && one.template.adaptation.events?.pre_easy_days).toEqual({ short: 2, half: 2, long: 4 })
  })
  it('jede HM-Vorlage, zufällige Nebenrennen: kein Tag mehr km, Renntage fest, Rennwoche ≤ Plan', () => {
    fc.assert(fc.property(
      fc.constantFrom(...HALF), fc.array(fc.record({ offset: fc.integer({ min: 0, max: 80 }), kind: fc.constantFrom('5k', '10k', 'half') as fc.Arbitrary<SeasonGoal['kind']>,
        role: fc.constantFrom(undefined, 'test', 'build', 'fun') as fc.Arbitrary<SeasonGoal['role']> }), { maxLength: 3 }),
      (id, rs) => {
        const b = blocks[id]
        const goals = rs.map((r) => race({ date: day(b.planStart, r.offset), kind: r.kind, role: r.role }))
        const out = applyEvents(b, goals)
        const raceDays = new Set(goals.filter((g) => out.sessions.some((s) => s.date === g.date && s.anchor && s.title === g.name)).map((g) => g.date))
        for (const s of b.sessions) if (!raceDays.has(s.date)) expect(km(at(out.sessions, s.date))).toBeLessThanOrEqual(km(s))
        for (const g of raceDays) {
          const w = b.weeks.find((x) => x.start <= g && g <= x.end)
          if (!w) continue
          const sum = (l: PlanSession[]) => l.filter((s) => s.date >= w.start && s.date <= w.end).reduce((t, s) => t + km(s), 0)
          const races = out.sessions.filter((s) => s.date >= w.start && s.date <= w.end && raceDays.has(s.date)).reduce((t, s) => t + km(s), 0)
          expect(sum(out.sessions)).toBeLessThanOrEqual(Math.max(sum(b.sessions), races) + 1e-9)
        }
      }), { numRuns: RUNS, seed })
  })
})

describe('Engine: Taper-Schutz und Erholungswoche nach Vorlage (AC-4)', () => {
  const fresh = { tsb: 0, acwr: 1 }, tired = { tsb: -40, acwr: 1 }
  const run = (today: string, state = EMPTY_ENGINE, fitness = fresh) =>
    runEngine({ today, at: `${today}T07:00:00Z`, manual: {}, state, runs: [], fitness })

  it('nichts rückt in den Taper der Vorlage (Pfitzinger HM: Wochen × 7 Tage), ohne den Wert nur in die letzten 9', () => {
    const b = blocks['pfitzinger-half']
    const guard = b.engine!.taperDays!
    expect(guard).toBeGreaterThan(9)
    const taperStart = day(b.race.date, -guard)
    const moved = (block: TrainingBlock) => {
      registerLiveBlocks([block])
      const out: string[] = []
      for (let d = day(taperStart, -6); d <= day(b.race.date, -1); d = day(d, 1)) {
        out.push(...run(d).added.filter((c) => c.rule === 'missed-key' && c.status === 'active').flatMap((c) => Object.keys(c.after)))
      }
      return out
    }
    expect(moved(b).filter((d) => d >= taperStart)).toEqual([])
    const legacy = { ...b, engine: { ...b.engine!, taperDays: undefined } }
    expect(moved(legacy).some((d) => d >= taperStart && d < day(b.race.date, -9))).toBe(true)
  })

  it('Vorlage verlangt Erholungswoche: nächste Woche auf den Erholungsumfang, höchstens alle 21 Tage, nichts rückt hinein', () => {
    const t = templates.find((m) => m.id === 'pfitzinger-half')!.params
    const tuned = tuneTemplate(t, { 'adaptation.triggers.fatigue_tsb': 'recovery_week_insertion' })
    if (!tuned.ok) throw new Error(tuned.errors.join())
    const draft = generateDraft({ goal: hm, template: tuned.template, start: '2026-11-30', profile: RUNNER,
      measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95.2, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft
    const b = freezeDraft(draft, hm, t.name, tuned.template)
    expect(b.engine!.recoveryVolume).toBe(t.volume.recovery_week.volume)
    registerLiveBlocks([b])
    // A Wednesday whose next week is a plain load week.
    const next = b.weeks.findIndex((w, i) => i > 2 && !w.taper && !w.recovery && !w.cutback && !w.light && b.sessions.every((s) => s.date < w.start || s.date > w.end || (!s.anchor && !s.test)))
    const week = b.weeks[next]
    const today = day(week.start, -5)
    const first = run(today, EMPTY_ENGINE, tired)
    const change = first.added.find((c) => c.rule === 'recovery-week')!
    expect(change.key).toBe(`recovery-week:${week.start}`)
    const loadKm = b.weeks.slice(0, next).filter((w) => !w.recovery && !w.cutback && !w.taper).at(-1)!.km
    const total = effectiveSessions({}, first.state.overrides).filter((s) => s.date >= week.start && s.date <= week.end).reduce((t, s) => t + km(s), 0)
    expect(total).toBeLessThan(week.km)
    expect(total).toBeLessThanOrEqual(t.volume.recovery_week.volume * loadKm + 3)
    // A week later, still tired: no second recovery week within 21 days; nothing moved into the inserted week.
    let state = first.state
    for (let d = day(today, 1); d <= day(today, 7); d = day(d, 1)) state = run(d, state, tired).state
    expect(state.log.filter((c) => c.rule === 'recovery-week' && c.status === 'active')).toHaveLength(1)
    const into = state.log.filter((c) => c.status === 'active' && (c.rule === 'missed-key' || c.rule === 'rebalance'))
      .flatMap((c) => Object.keys(c.after)).filter((d) => d >= week.start && d <= week.end)
    expect(into).toEqual([])
    // Undo restores the week and vetoes it.
    const undone = undoChange(first.state, change.id)
    if ('error' in undone) throw new Error(undone.error)
    expect(run(today, undone, tired).added.some((c) => c.rule === 'recovery-week')).toBe(false)
  })

  it('ohne diese Vorlage: keine Erholungswoche, nur der Ermüdungsschutz', () => {
    registerLiveBlocks([blocks['pfitzinger-half']])
    const added = run('2027-01-06', EMPTY_ENGINE, tired).added
    expect(added.some((c) => c.rule === 'recovery-week')).toBe(false)
  })
})

describe('Erholungswochen im generierten Block (07-18)', () => {
  it('jede Erholungswoche des Gerüsts trägt cutback, keine andere; recovery nur nach dem Rennen (07-22)', () => {
    for (const id of HALF) for (const w of blocks[id].weeks) {
      expect(!!w.cutback, `${id} ${w.start} ${w.focus}`).toBe(/Erholungswoche/.test(w.focus))
      expect(!!w.recovery, `${id} ${w.start}`).toBe(w.start > blocks[id].race.date)
    }
  })
})
