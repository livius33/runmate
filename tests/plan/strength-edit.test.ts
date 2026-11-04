// Kettlebell markers in the editor and on the Heute-Karte: on/off as a manual edit, they move with their
// session, week km and warnings stay as without them, the Heute line and its tired override.
import { describe, expect, it } from 'vitest'
import { addDays, format, getISODay, parseISO } from 'date-fns'
import { baseBlocks, type BaseRun } from '@/lib/plan/base-block'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { KB } from '@/lib/plan/strength'
import { registerLiveBlocks } from '@/lib/plan/blocks'
import { applyMove, effectiveSessions, toggleStrength, weekSummary } from '@/lib/plan/effective'
import { todayInsight } from '@/lib/insights/today'

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const wd = (d: string) => getISODay(parseISO(d))
const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [2, 4, 6], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}

describe('Bearbeiten und Heute (AC-2, AC-3, AC-4)', () => {
  const runs: BaseRun[] = []
  for (let d = '2026-06-01'; d <= '2026-11-29'; d = day(d, 1)) if (wd(d) !== 5) runs.push({ date: d, km: 9 })
  const base = baseBlocks({ blocks: [PORTO_2026], runs, today: '2026-11-30', profile: RUNNER })
  registerLiveBlocks(base)
  const TUE = '2026-12-01', WED = '2026-12-02', SAT = '2026-12-05'
  const week = base[0].weeks[0]
  const sessions = effectiveSessions({})
  it('Marker an/aus als eigene Änderung; zurück zum Plan = keine Änderung', () => {
    expect(sessions.find((s) => s.date === TUE)!.strength).toBeTruthy()
    const off = toggleStrength({}, TUE, sessions)
    expect(off[TUE].strength).toBeUndefined()
    expect(off[TUE].km).toBe(sessions.find((s) => s.date === TUE)!.km)
    expect(toggleStrength(off, TUE, effectiveSessions(off))).toEqual({})
    const on = toggleStrength({}, WED, sessions)
    expect(on[WED].strength).toEqual(KB.regular)
    // a hand-written block gets none by placement, but the runner may add one by hand (example block, KW48 Tuesday)
    expect(sessions.find((s) => s.date === '2026-11-24')!.strength).toBeUndefined()
    expect(toggleStrength({}, '2026-11-24', sessions)['2026-11-24'].strength).toEqual(KB.regular)
    // never on race day
    const race = sessions.find((s) => s.type === 'race')!
    expect(toggleStrength({}, race.date, sessions)).toEqual({})
  })
  it('wandert beim Verschieben mit; Wochen-km und Warnungen unverändert', () => {
    const actual = new Map<string, number>()
    const moved = applyMove({}, TUE, WED, 'swap', '2026-11-30', sessions, actual)
    const eff = effectiveSessions(moved)
    expect(eff.find((s) => s.date === WED)!.strength).toBeTruthy()
    expect(eff.find((s) => s.date === TUE)!.strength).toBeUndefined()
    const noKb = sessions.map(({ strength: _s, ...s }) => s)
    const a = weekSummary(week, '2026-11-30', sessions, actual), b = weekSummary(week, '2026-11-30', noKb, actual)
    expect([a.forecastKm, a.gapKm, a.warnings]).toEqual([b.forecastKm, b.gapKm, b.warnings])
  })
  it('Heute-Karte: Zeile mit Marker, auslassen wenn müde, nichts ohne Marker', () => {
    const args = { sessions, manual: {}, engineLog: [], runs: [], acwr: null }
    expect(todayInsight({ ...args, today: TUE, tsb: 0 }).strength).toBe('Danach Kettlebell 30–40 Min. (RPE 5–8).')
    expect(todayInsight({ ...args, today: SAT, tsb: 0 }).strength).toContain('optional')
    expect(todayInsight({ ...args, today: TUE, tsb: -40 }).strength).toMatch(/^Kettlebell heute auslassen/)
    expect(todayInsight({ ...args, today: WED, tsb: 0 })).not.toHaveProperty('strength')
    registerLiveBlocks([])
  })
})
