// Race week and race day for every training block (07-15): the example block keeps its splits, a generated race derives its own.
import { afterEach, describe, expect, it } from 'vitest'
import { RACE, SPLITS, PORTO_2026 } from '@/examples/porto-2026/plan'
import { registerLiveBlocks } from '@/lib/plan/blocks'
import { checkpoints, elapsedAt, racePlan, splitsFor } from '@/lib/plan/race-day'
import { CHECKLIST_IDS, raceWeek, raceWeekDay } from '@/lib/plan/race-week'
import type { RaceInfo, TrainingBlock } from '@/lib/plan/types'

afterEach(() => registerLiveBlocks([]))
const hmRace: RaceInfo = { name: 'Halbmarathon', shortName: 'Halbmarathon', code: 'HM', date: '2027-02-28', distanceKm: 21.0975,
  goalS: 5100, goalPaceS: 242, fallbackS: 5280, fallbackPaceS: 250 }
const hmBlock: TrainingBlock = { ...PORTO_2026, handWritten: undefined, paces: undefined, id: 'gen-hm-2027', goalId: 'hm-2027', race: hmRace, planStart: '2026-11-30', end: '2027-02-28', engine: undefined,
  weeks: [{ kw: 8, start: '2027-02-22', end: '2027-02-28', km: 36, focus: 'Taper · Rennwoche', taper: true }],
  sessions: [{ date: '2027-02-25', type: 'tempo', km: 9, key: true, title: 'Qualität', pace: '4:02', notes: '2,5 ein → 2 × 2 km @ 4:02 (0,5 km Trab) → 2 aus. Renntempo-Erinnerung, locker bleiben.' },
    { date: '2027-02-26', type: 'rest', title: 'Ruhetag' }, { date: '2027-02-27', type: 'easy', km: 3, title: 'Shakeout' },
    { date: '2027-02-28', type: 'race', km: 21.1, title: 'Halbmarathon', anchor: true }] }

describe('Porto unverändert', () => {
  it('Rennwoche aus den eigenen Einheiten, Checkliste, Plan A und Kontrollpunkte', () => {
    const w = raceWeek(PORTO_2026.race)
    expect(w.days.map((d) => d.title)).toEqual(['Ruhetag', 'Kurze Renntempo-Erinnerung', 'Lockerer Lauf', 'Lockerer Lauf', 'Carb-Loading Tag 1', 'Carb-Loading Tag 2', 'Renntag'])
    expect(w.checklist.map((c) => c.id)).toEqual(CHECKLIST_IDS)
    expect(w.wake).toBe('4:45')
    expect(racePlan('A', PORTO_2026.race)).toEqual(SPLITS)
    expect(checkpoints(racePlan('A', PORTO_2026.race), PORTO_2026.race).map((c) => c.label))
      .toEqual(['km 5', 'km 10', 'km 15', 'km 20', 'Halbmarathon', 'km 25', 'km 30', 'km 35', 'km 38', 'km 40', 'Ziel'])
  })
  it('ein Marathon ohne eigene Splits bekommt die Form des Beispiels: bei 3:05 genau dessen Abschnitte und Tempi', () => {
    expect(splitsFor({ ...RACE, splits: undefined }).map(({ from, to, paceS, focus }) => ({ from, to, paceS, focus })))
      .toEqual(SPLITS.map(({ from, to, paceS, focus }) => ({ from, to, paceS, focus })))
  })
})

describe('Halbmarathon-Block', () => {
  it('Splits ergeben die Zielzeit, Kontrollpunkte je 5 km, Plan B im Ausweichtempo', () => {
    const a = racePlan('A', hmRace)
    expect(a.map((s) => [s.from, s.to])).toEqual([[0, 3], [3, 15], [15, 21.0975]])
    expect(5100 - elapsedAt(a, 21.0975)).toBeGreaterThanOrEqual(0)
    expect(5100 - elapsedAt(a, 21.0975)).toBeLessThan(10)
    expect(checkpoints(a, hmRace).map((c) => c.label)).toEqual(['km 5', 'km 10', 'km 15', 'km 20', 'Ziel'])
    expect(racePlan('B', hmRace).every((s) => s.paceS === 250)).toBe(true)
  })
  it('Rennwoche aus dem eigenen Block: kein Zwei-Tage-Carb-Loading, gleiche Checklisten-IDs, kein Porto', () => {
    registerLiveBlocks([hmBlock])
    const w = raceWeek(hmRace)
    expect(w.days.map((d) => d.title)).not.toContain('Carb-Loading Tag 1')
    expect(w.days.find((d) => d.date === '2027-02-27')!.focus.join(' ')).toContain('6–8 g/kg')
    expect(w.days.find((d) => d.date === '2027-02-25')!.focus[0]).toContain('2 × 2 km @ 4:02')
    expect(w.checklist.map((c) => c.id)).toEqual(CHECKLIST_IDS)
    expect(JSON.stringify(w)).not.toContain('Porto')
    expect(raceWeekDay('2027-02-28')?.title).toBe('Renntag')
  })
})
