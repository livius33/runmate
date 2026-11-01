// Generator inputs measured from runs and the plan (07-06): current km, proven km, longest runs, recent race.
import { describe, expect, it } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { measureInputs, type RunRow } from '@/lib/plan/generator/inputs'
import type { PlanSession, PlanWeek } from '@/lib/plan/types'

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
// One run per Saturday-ish: a week's km as three runs (Tue, Thu, Sat).
const weekRuns = (monday: string, km: number, long = km / 2): RunRow[] => [
  { date: day(monday, 1), distanceM: ((km - long) / 2) * 1000, durationS: 3000 },
  { date: day(monday, 3), distanceM: ((km - long) / 2) * 1000, durationS: 3000 },
  { date: day(monday, 5), distanceM: long * 1000, durationS: 6000 },
]
const plannedWeek = (monday: string, km: number): PlanSession[] =>
  [1, 3, 5].map((k, i) => ({ date: day(monday, k), type: i === 2 ? 'long' : 'easy', km: i === 2 ? km / 2 : km / 4, title: 'x' } as PlanSession))

describe('Eingaben aus Läufen und Plan (AC-1)', () => {
  const today = '2026-10-24'
  // 8 weeks of runs before today: 40 … 100 km, then the plan: two weeks, the last one a recovery week of 50 km.
  const kms = [40, 60, 80, 100, 100, 100, 100, 60]
  const runs = kms.flatMap((km, i) => weekRuns(day('2026-08-24', 7 * i), km))
  const plan = [...plannedWeek('2026-11-16', 30), ...plannedWeek('2026-11-23', 50)]
  const weeks: PlanWeek[] = [
    { kw: 47, start: '2026-11-16', end: '2026-11-22', km: 30, focus: '', recovery: true },
    { kw: 48, start: '2026-11-23', end: '2026-11-29', km: 50, focus: '', recovery: true },
  ]

  it('Start in der Zukunft: B = geplante Woche davor, im Erholungsblock mit dieser Quelle', () => {
    const m = measureInputs({ runs, plan, weeks, today, start: '2026-11-30', distance: 'half' })
    expect([m.currentKm, m.currentKmSource]).toEqual([50, 'recoveryBlock'])
  })
  it('Start in der Vergangenheit: B = Schnitt der letzten 4 abgeschlossenen Wochen', () => {
    const m = measureInputs({ runs, plan, weeks, today, start: '2026-10-19', distance: 'half' })
    expect([m.currentKm, m.currentKmSource]).toEqual([90, 'mean4'])
  })
  it('P = höchster 4-Wochen-Schnitt der letzten 52 Wochen (nur Läufe)', () => {
    expect(measureInputs({ runs, plan, weeks, today, start: '2026-11-30', distance: 'half' }).provenKm).toBe(100)
  })
  it('Längster Lauf 30 Tage: Läufe vor heute + geplante Läufe bis zum Start, ohne Rennen; 12 Monate mit Rennen', () => {
    const withRace = [...runs, { date: '2026-10-20', distanceM: 42195, durationS: 11100, workoutType: 1 }]
    const m = measureInputs({ runs: withRace, plan, weeks, today, start: '2026-11-16', distance: 'half' })
    expect(m.longest30Km).toBe(30)          // window 17.10.–15.11.: long run 17.10. (30 km); the marathon on 20.10. (42,2) does not count
    expect(m.longest12mKm).toBe(50)         // the 50-km long run of a 100-km week …
    expect(measureInputs({ runs: withRace.slice(-1), plan: [], weeks, today, start: '2026-11-16', distance: 'half' }).longest12mKm).toBe(42.2)   // … and races count here
    const late = measureInputs({ runs, plan, weeks, today, start: '2026-11-30', distance: 'half' })
    expect(late.longest30Km).toBe(25)        // planned long runs 21.11. (15 km) and 28.11. (25 km)
  })
  it('Letztes Rennen: bestes der letzten 6 Monate nach Vorhersage; Standarddistanzen ± 3 %', () => {
    const races: RunRow[] = [
      { date: '2026-09-13', distanceM: 10050, durationS: 38 * 60, workoutType: 1 },
      { date: '2026-10-11', distanceM: 21150, durationS: 84 * 60, sportType: 'Race' },
      { date: '2026-03-01', distanceM: 10000, durationS: 35 * 60, workoutType: 1 },   // older than 6 months
      { date: '2026-10-04', distanceM: 15000, durationS: 55 * 60, workoutType: 1 },   // no standard distance
    ]
    const m = measureInputs({ runs: [...runs, ...races], plan, weeks, today, start: '2026-11-30', distance: 'half' })
    expect(m.recentRace).toMatchObject({ distanceKm: 10, timeS: 38 * 60, date: '2026-09-13' })
    expect(measureInputs({ runs, plan, weeks, today, start: '2026-11-30', distance: 'half' }).recentRace).toBeNull()
  })
})
