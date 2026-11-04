// Recovery flags in the per-block engine: ≥ 2 flags = tired, same fatigue guard as TSB/ACWR (share, anchors, undo);
// 1 flag = a hint only; no data = engine unchanged.
import { afterEach, describe, expect, it } from 'vitest'
import { registerLiveBlocks } from '@/lib/plan/blocks'
import { DEFAULT_RULES, inRedZone, type EngineRules } from '@/lib/plan/rules'
import { EMPTY_ENGINE, runEngine, tired, undoChange, type EngineState, type Fitness } from '@/lib/plan/engine'
import { effectiveSessions } from '@/lib/plan/effective'
import { todayInsight } from '@/lib/insights/today'
import { recoveryDay, type RecoveryFlag } from '@/lib/analytics/recovery-data'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import type { PlanSession, TrainingBlock } from '@/lib/plan/types'
import { history, night } from './fixtures'

afterEach(() => registerLiveBlocks([]))

const s = (date: string, type: PlanSession['type'], km: number, key = false): PlanSession =>
  ({ date, type, km, title: key ? 'Qualität' : 'Locker', ...(key ? { key, pace: '4:00', notes: '2 ein → 6 km @ 4:00 → 2 aus' } : {}) })
const block = (engine?: EngineRules): TrainingBlock => ({
  ...PORTO_2026, id: 'gen-test', goalId: 'test', planStart: '2026-11-30', end: '2026-12-27', engine,
  race: { ...PORTO_2026.race, name: 'Test', date: '2026-12-27', code: 'T' },
  weeks: [{ kw: 49, start: '2026-11-30', end: '2026-12-06', km: 52, focus: 'Aufbau' }, { kw: 50, start: '2026-12-07', end: '2026-12-13', km: 40, focus: 'Aufbau' },
    { kw: 51, start: '2026-12-14', end: '2026-12-20', km: 40, focus: 'Aufbau' }, { kw: 52, start: '2026-12-21', end: '2026-12-27', km: 30, focus: 'Taper', taper: true }],
  sessions: [s('2026-11-30', 'easy', 8), s('2026-12-01', 'tempo', 10, true), s('2026-12-02', 'easy', 8), s('2026-12-03', 'tempo', 12, true),
    s('2026-12-04', 'easy', 6), s('2026-12-05', 'long', 8), { date: '2026-12-06', type: 'rest', title: 'Ruhetag' },
    s('2026-12-08', 'tempo', 10, true), s('2026-12-10', 'tempo', 10, true),
    { date: '2026-12-27', type: 'race', km: 21.1, title: 'Test', anchor: true }],
})
const FRESH = { tsb: 0, acwr: 1 }
const withFlags = (date: string, flags: RecoveryFlag[]): Fitness => ({ ...FRESH, recovery: { date, flags } })
const run = (today: string, fitness: Fitness, state: EngineState = EMPTY_ENGINE) =>
  runEngine({ today, at: `${today}T07:00:00Z`, manual: {}, state, runs: [], fitness })

describe('tired() mit Erholungs-Flags', () => {
  it('2 Flags → müde; 1 Flag nie; TSB/ACWR-Schwellen unverändert', () => {
    expect(tired(withFlags('2026-11-09', ['hrv', 'rhr']))).toBe(true)
    expect(tired(withFlags('2026-11-20', ['sleep']))).toBe(false)
    expect(inRedZone(withFlags('2026-11-20', ['hrv', 'rhr', 'sleep']), DEFAULT_RULES)).toBe(false)   // load red zone untouched
    expect(tired({ tsb: DEFAULT_RULES.tsbRed + 1, acwr: DEFAULT_RULES.acwrRed })).toBe(false)
    expect(tired({ tsb: DEFAULT_RULES.tsbRed - 1, acwr: 1 })).toBe(true)
  })
})

describe('Ermüdungsschutz aus der Nacht', () => {
  it('2 Flags: die nächste harte Einheit wird lockerer Lauf (70 %), Grund nennt die Erholung', () => {
    registerLiveBlocks([block()])
    const soft = run('2026-12-03', withFlags('2026-12-03', ['hrv', 'rhr'])).added.find((c) => c.rule === 'fatigue')
    expect(soft?.status).toBe('active')
    expect(soft?.after['2026-12-03']).toMatchObject({ type: 'easy', km: 8.5 })                      // 70 % of 12 km, like TSB
    expect(soft?.reason).toBe('Ermüdungsschutz (Erholung schwach (HRV niedrig, Ruhepuls hoch)): Qualität am Do. 3.12. wird lockerer Lauf (8,5 km)')
    // Same change as the TSB guard, apart from the reason.
    const byTsb = run('2026-12-03', { tsb: -30, acwr: 1 }).added.find((c) => c.rule === 'fatigue')
    expect(byTsb?.after['2026-12-03']).toMatchObject({ type: soft!.after['2026-12-03'].type, km: soft!.after['2026-12-03'].km })
  })

  it('Zurücknehmen wirkt wie beim TSB-Schutz: dieselbe Einheit bleibt danach hart', () => {
    registerLiveBlocks([block()])
    const f = withFlags('2026-12-03', ['hrv', 'sleep'])
    const first = run('2026-12-03', f)
    const change = first.added.find((c) => c.rule === 'fatigue')!
    const undone = undoChange(first.state, change.id)
    if ('error' in undone) throw new Error(undone.error)
    expect(run('2026-12-03', f, undone).added.some((c) => c.rule === 'fatigue')).toBe(false)
  })

  it('Rennen bleibt Anker: nur ein Hinweis', () => {
    registerLiveBlocks([block()])
    const note = run('2026-12-25', withFlags('2026-12-25', ['hrv', 'rhr'])).added.find((c) => c.rule === 'fatigue')
    expect(note).toMatchObject({ status: 'info' })
    expect(note?.reason).toContain('Sehr müde (Erholung schwach (HRV niedrig, Ruhepuls hoch)) vor Test')
  })

  it('1 Flag: keine Planänderung', () => {
    registerLiveBlocks([block()])
    expect(run('2026-12-03', withFlags('2026-12-03', ['hrv'])).added).toEqual(run('2026-12-03', FRESH).added)
  })

  it('keine Erholungswoche aus der Nacht (nur die Last-Rote-Zone fügt eine ein)', () => {
    registerLiveBlocks([block({ ...DEFAULT_RULES, fatigueStrategy: 'recovery_week_insertion', recoveryVolume: 0.2 })])
    const added = run('2026-12-03', withFlags('2026-12-03', ['hrv', 'rhr'])).added
    expect(added.some((c) => c.rule === 'fatigue')).toBe(true)
    expect(added.some((c) => c.rule === 'recovery-week')).toBe(false)
    expect(run('2026-12-03', { tsb: -30, acwr: 1 }).added.some((c) => c.rule === 'recovery-week')).toBe(true)
  })

  it('ohne Daten (oder ohne Flags) bleibt jede Engine-Ausgabe gleich', () => {
    registerLiveBlocks([block()])
    for (const d of ['2026-12-01', '2026-12-03', '2026-12-09']) {
      const plain = run(d, FRESH)
      expect(run(d, withFlags(d, []))).toEqual(plain)
      expect(run(d, { ...FRESH, recovery: undefined })).toEqual(plain)
    }
  })
})

describe('Heute-Karte', () => {
  const sessionsOf = () => effectiveSessions({}, {})
  const insight = (today: string, flags: Partial<Parameters<typeof night>[1]> | null, nights = 10) => {
    const rows = [...history(nights, today), ...(flags ? [night(today, flags)] : [])]
    return todayInsight({ today, sessions: sessionsOf(), manual: {}, engineLog: [], runs: [], tsb: 0, acwr: 1, recovery: recoveryDay(rows, today) })
  }
  const plain = (today: string) => todayInsight({ today, sessions: sessionsOf(), manual: {}, engineLog: [], runs: [], tsb: 0, acwr: 1 })

  it('1 Flag: Hinweis "Heute eher locker halten", Rat und Plan unverändert', () => {
    registerLiveBlocks([block()])
    const i = insight('2026-12-03', { sleepS: 5 * 3600 })
    expect(i.hint).toBe('Heute eher locker halten (kurz geschlafen).')
    expect(i.advice).toBe(plain('2026-12-03').advice)
    expect(i.night?.text).toBe('Letzte Nacht: 5:00 h · HRV 64 (Basis 64) · Ruhepuls 49 (Basis 49)')
  })

  it('2 Flags: "Sehr müde" mit Erholungsgrund, kein Hinweis', () => {
    registerLiveBlocks([block()])
    const i = insight('2026-12-03', { hrvAvg: 50, rhr: 56 })
    expect(i.advice).toBe('Sehr müde (Erholung schwach (HRV niedrig, Ruhepuls hoch)): heute locker, notfalls kürzen.')
    expect(i.hint).toBeUndefined()
  })

  it('keine Nacht: gedämpfte Zeile; ohne Wellness-Daten überhaupt: keine Zeile, nichts anders', () => {
    registerLiveBlocks([block()])
    expect(insight('2026-11-03', null).night).toMatchObject({ text: 'Keine Schlafdaten – Uhr nachts tragen', muted: true })
    const p = plain('2026-11-03')
    expect(p.night).toBeUndefined()
    expect(p.hint).toBeUndefined()
    const { night: _, ...rest } = insight('2026-11-03', null)
    expect(rest).toEqual(p)
  })
})
