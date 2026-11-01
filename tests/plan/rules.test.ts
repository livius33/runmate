// Adaptation from the template (07-07): engine rules per training block. Porto keeps DEFAULT_RULES (proven by the
// snapshot); a live block follows the rules frozen from its template.
import { afterEach, describe, expect, it } from 'vitest'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { registerLiveBlocks } from '@/lib/plan/blocks'
import { ACWR_PERSIST_DAYS, DEFAULT_RULES, acwrCaution, acwrStreak, inRedZone, rulesFor, rulesFromTemplate, type EngineRules } from '@/lib/plan/rules'
import { baseBlocks } from '@/lib/plan/base-block'
import { todayInsight } from '@/lib/insights/today'
import { periodFor, suggestions } from '@/lib/plan/workshop'
import { EMPTY_ENGINE, runEngine } from '@/lib/plan/engine'
import { generateDraft, type Draft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import type { PlanSession, TrainingBlock } from '@/lib/plan/types'

const pfitz = listMethodologies().valid.find((m) => m.id === 'pfitzinger-half')!.params
afterEach(() => registerLiveBlocks([]))

const strict: EngineRules = { ...DEFAULT_RULES, tsbRed: -20, fatigueShare: 0.6, moveMissedKey: false, rebalance: false, keyGapDays: 1 }
const s = (date: string, type: PlanSession['type'], km: number, key = false): PlanSession => ({ date, type, km, title: key ? 'Qualität' : 'Locker', ...(key ? { key, pace: '4:00', notes: '2 ein → 6 km @ 4:00 → 2 aus' } : {}) })
const block = (engine?: EngineRules): TrainingBlock => ({
  ...PORTO_2026, handWritten: undefined, paces: undefined, id: 'gen-test', goalId: 'test', planStart: '2026-11-30', end: '2026-12-27', engine,
  race: { ...PORTO_2026.race, name: 'Test', date: '2026-12-27', code: 'T' },
  weeks: [{ kw: 49, start: '2026-11-30', end: '2026-12-06', km: 52, focus: 'Aufbau' }, { kw: 50, start: '2026-12-07', end: '2026-12-13', km: 40, focus: 'Aufbau' },
    { kw: 51, start: '2026-12-14', end: '2026-12-20', km: 40, focus: 'Aufbau' }, { kw: 52, start: '2026-12-21', end: '2026-12-27', km: 30, focus: 'Taper', taper: true }],
  sessions: [s('2026-11-30', 'easy', 8), s('2026-12-01', 'tempo', 10, true), s('2026-12-02', 'easy', 8), s('2026-12-03', 'tempo', 12, true),
    s('2026-12-04', 'easy', 6), s('2026-12-05', 'long', 8), { date: '2026-12-06', type: 'rest', title: 'Ruhetag' },
    { date: '2026-12-27', type: 'race', km: 21.1, title: 'Test', anchor: true }],
})
const run = (today: string, fitness: { tsb: number | null; acwr: number | null; acwrRecent?: (number | null)[] } = { tsb: 0, acwr: 1 }) =>
  runEngine({ today, at: `${today}T07:00:00Z`, manual: {}, state: EMPTY_ENGINE, runs: [], fitness }).added

describe('Regeln je Trainingsblock (07-07)', () => {
  it('Porto und Tage ohne Live-Block: DEFAULT_RULES', () => {
    expect(rulesFor('2026-10-20')).toEqual(DEFAULT_RULES)
    registerLiveBlocks([block(strict)])
    expect(rulesFor('2026-11-29')).toEqual(DEFAULT_RULES)
    expect(rulesFor('2026-12-02')).toEqual(strict)
  })
  it('Ermüdungsschutz: Schwelle und Anteil der Vorlage (TSB −22 ist bei −20 schon rot, bei Porto −25 nicht)', () => {
    registerLiveBlocks([block(strict)])
    const soft = run('2026-12-03', { tsb: -22, acwr: 1 }).find((c) => c.rule === 'fatigue')
    expect(soft?.after['2026-12-03']).toMatchObject({ type: 'easy', km: 7 })        // 60 % of 12 km
    registerLiveBlocks([block()])                                                   // same block on Porto's rules
    expect(run('2026-12-03', { tsb: -22, acwr: 1 }).filter((c) => c.rule === 'fatigue')).toEqual([])
  })
  it('verpasste Schlüsseleinheit: die Vorlage holt nicht nach (Hinweis), Porto-Regeln verschieben', () => {
    registerLiveBlocks([block(strict)])
    const note = run('2026-12-02').find((c) => c.rule === 'missed-key')
    expect(note).toMatchObject({ status: 'info' })
    expect(note?.reason).toContain('nach deiner Vorlage nicht nachgeholt')
    registerLiveBlocks([block()])
    expect(run('2026-12-02').some((c) => c.rule === 'missed-key' && c.status === 'active')).toBe(true)
  })
  it('fehlende km: die Vorlage verteilt nicht, Porto-Regeln schon', () => {
    registerLiveBlocks([block(strict)])
    expect(run('2026-12-02').filter((c) => c.rule === 'rebalance')).toEqual([])
    registerLiveBlocks([block()])
    expect(run('2026-12-02').some((c) => c.rule === 'rebalance' && c.status === 'active')).toBe(true)
  })
  it('Einfrieren übernimmt die Regeln der (angepassten) Vorlage', () => {
    const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
    const d = generateDraft({ goal: hm, template: pfitz, start: '2026-11-30', profile: null,
      measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 95, longest30Km: 16, longest12mKm: 42.2, recentRace: null } }) as Draft
    const b = freezeDraft(d, hm, 'Pfitzinger – Halbmarathon', pfitz)
    expect(b.engine).toEqual(rulesFromTemplate(pfitz, 'half'))
    expect(b.engine).toMatchObject({ tsbRed: -25, fatigueShare: 0.7, moveMissedKey: true, maxShiftDays: 4, keyGapDays: 1, rebalance: false, recentHigh: 1.1 })
  })
})

// ACWR persistence (07-23, G-24; research adaptation.md §2.3): ACWR alone counts only after 3 days in a row above the
// block's threshold; Porto keeps its one-day rule.
describe('ACWR braucht 3 Tage am Stück (07-23)', () => {
  const gen = rulesFromTemplate(pfitz, 'half')
  const hi = gen.acwrRed + 0.1, lo = gen.acwrRed - 0.3
  const f = (acwrRecent: (number | null)[], tsb = 0) => ({ tsb, acwr: acwrRecent[0], acwrRecent })
  const fatigue = (today: string, fit: ReturnType<typeof f>) => run(today, fit).filter((c) => c.rule === 'fatigue')

  it('generierter Block: 3 Tage über der Schwelle → rote Zone, Grund nennt die Tage', () => {
    expect(gen.acwrPersistDays).toBeUndefined()                                     // frozen without the field → 3
    registerLiveBlocks([block(gen)])
    const c = fatigue('2026-12-03', f([hi, hi, hi]))
    expect(c).toHaveLength(1)
    expect(c[0].reason).toContain('seit 3 Tagen')
  })
  it('generierter Block: 1–2 Tage über der Schwelle → keine Änderung, nur Vorsicht', () => {
    registerLiveBlocks([block(gen)])
    expect(fatigue('2026-12-03', f([hi, hi, lo]))).toEqual([])
    expect(fatigue('2026-12-03', f([hi, lo, lo]))).toEqual([])
    expect(acwrCaution(f([hi, hi, lo]), gen)).toBe(true)
    expect(acwrStreak(f([hi, hi, lo]), gen)).toBe(2)
    expect(acwrCaution(f([hi, hi, hi]), gen)).toBe(false)                          // red, not caution
    expect(acwrCaution(f([lo, hi, hi]), gen)).toBe(false)                          // today not above
  })
  it('TSB zählt weiter allein, ab dem ersten Tag', () => {
    registerLiveBlocks([block(gen)])
    expect(fatigue('2026-12-03', f([1, 1, 1], gen.tsbRed - 5))).toHaveLength(1)
    expect(inRedZone(f([lo, lo, lo], gen.tsbRed - 1), gen)).toBe(true)
  })
  it('Porto-Regeln: ein Tag reicht wie bisher', () => {
    expect(DEFAULT_RULES.acwrPersistDays).toBe(1)
    expect(inRedZone(f([1.6, 1, 1]), DEFAULT_RULES)).toBe(true)
    expect(inRedZone({ tsb: 0, acwr: 1.6 }, DEFAULT_RULES)).toBe(true)                // without history, as before
    registerLiveBlocks([block()])                                                   // block without engine → DEFAULT_RULES
    const c = fatigue('2026-12-03', f([1.6, 1, 1]))
    expect(c).toHaveLength(1)
    expect(c[0].reason).not.toContain('seit')
  })
  it('fehlende Tage zählen als „nicht darüber“', () => {
    expect(inRedZone(f([hi, null, hi]), gen)).toBe(false)
    expect(inRedZone({ tsb: 0, acwr: hi }, gen)).toBe(false)                        // only today known
    expect(inRedZone(f([hi, hi]), gen)).toBe(false)
  })
  it('Heute-Karte: 3 Tage → „Sehr müde“ mit Tagen, 2 Tage → Vorsichtszeile, Rat bleibt', () => {
    const b = block(gen)
    registerLiveBlocks([b])
    const at = (acwrRecent: (number | null)[]) => todayInsight({ today: '2026-12-03', sessions: b.sessions, manual: {}, engineLog: [], runs: [], tsb: 0, acwr: acwrRecent[0], acwrRecent })
    const red = at([hi, hi, hi])
    expect(red.advice).toMatch(/^Sehr müde \(ACWR .* seit 3 Tagen\)/)
    expect(red.caution).toBeUndefined()
    const two = at([hi, hi, lo])
    expect(two.advice).not.toContain('Sehr müde')
    expect(two.caution).toMatch(/^Belastung hoch \(ACWR .*, 2\. Tag\): vorsichtig, noch keine Planänderung\.$/)
    expect(at([lo, lo, lo]).caution).toBeUndefined()
  })
  it('Plan anpassen: Ermüdungsvorschlag erst nach 3 Tagen', () => {
    const b = block(gen)
    registerLiveBlocks([b])
    const today = '2026-12-01'
    const input = (acwrRecent: (number | null)[]) => ({ today, period: periodFor({ kind: 'weeks', weeks: 2 }, today, []), sessions: b.sessions, manual: {},
      actual: new Map<string, number>(), fitness: f(acwrRecent), events: [], profile: null, recent: null })
    const red = suggestions(input([hi, hi, hi])).find((x) => x.kind === 'fatigue')
    expect(red?.why.join(' ')).toContain('seit 3 Tagen')
    expect(suggestions(input([hi, hi, lo])).some((x) => x.kind === 'fatigue')).toBe(false)
  })
  it('Grundlagenblock nach Porto: Porto-Regeln mit 3 Tagen ACWR', () => {
    const [b] = baseBlocks({ blocks: [PORTO_2026], runs: [], today: '2026-12-02', profile: null })
    expect(b.engine).toEqual({ ...DEFAULT_RULES, acwrPersistDays: ACWR_PERSIST_DAYS })
    expect(ACWR_PERSIST_DAYS).toBe(3)
  })
})
