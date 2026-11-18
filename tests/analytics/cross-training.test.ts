// Cross-training (08-01): type mapping, load per sport, the Porto gate and the run-only filters.
import { describe, expect, it } from 'vitest'
import { parseISO } from 'date-fns'
import { CROSS_TYPES, crossTypeForKey, isCrossType, parseCrossEntry } from '@/lib/analytics/cross-training'
import { BIKE_LOAD_FACTOR, CROSS_LOAD_FROM, DEFAULT_RPE, SRPE_TO_TRIMP, activityLoad, dailyLoads, dailyLoadsBySport, fitnessSeries, trimp } from '@/lib/analytics/load'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'

const AFTER = '2026-11-20'              // after the gate
const row = (o: Partial<{ date: string; type: string; durationS: number; averageHr: number | null; sufferScore: number | null; perceivedExertion: number | null }>) =>
  ({ date: AFTER, type: 'Run', durationS: 3600, averageHr: null, sufferScore: null, perceivedExertion: null, ...o })

describe('Garmin type mapping', () => {
  it('strength, swim, ride and gym keys', () => {
    expect(crossTypeForKey('strength_training')).toEqual({ type: 'Strength', sportType: 'strength_training' })
    expect(crossTypeForKey('lap_swimming')?.type).toBe('Swim')
    expect(crossTypeForKey('open_water_swimming')?.type).toBe('Swim')
    for (const k of ['cycling', 'road_biking', 'indoor_cycling', 'virtual_ride', 'mountain_biking', 'gravel_cycling', 'e_bike_fitness'])
      expect(crossTypeForKey(k)?.type, k).toBe('Ride')
    for (const k of ['indoor_cardio', 'fitness_equipment', 'hiit', 'elliptical', 'stair_climbing', 'indoor_rowing'])
      expect(crossTypeForKey(k)?.type, k).toBe('Gym')
  })
  it('runs and everything else stay out of the cross-training import', () => {
    for (const k of ['running', 'trail_running', 'treadmill_running', 'walking', 'hiking', 'yoga', 'pilates', 'breathwork'])
      expect(crossTypeForKey(k), k).toBeNull()
  })
  it('cross types and run types never overlap', () => {
    for (const t of CROSS_TYPES) expect(RUN_ACTIVITY_TYPES).not.toContain(t)
    for (const t of RUN_ACTIVITY_TYPES) expect(isCrossType(t)).toBe(false)
  })
})

describe('load per sport', () => {
  it('runs: HR-TRIMP as before, suffer score as the fallback, rows without a type count as runs', () => {
    expect(activityLoad(row({ averageHr: 140 }))).toBeCloseTo(trimp(3600, 140), 6)
    expect(activityLoad(row({ sufferScore: 50 }))).toBe(20)
    expect(activityLoad({ date: AFTER, durationS: 3600, averageHr: 140, sufferScore: null })).toBeCloseTo(trimp(3600, 140), 6)
    expect(activityLoad(row({ type: 'TrailRun', averageHr: 140, perceivedExertion: 9 }))).toBeCloseTo(trimp(3600, 140), 6)   // RPE never changes a run
  })
  it('strength: minutes × RPE × 0,2, never the HR', () => {
    expect(activityLoad(row({ type: 'Strength', durationS: 40 * 60, perceivedExertion: 7, averageHr: 150 }))).toBeCloseTo(40 * 7 * SRPE_TO_TRIMP, 6)
    expect(activityLoad(row({ type: 'Strength', durationS: 40 * 60, averageHr: 150 }))).toBeCloseTo(40 * DEFAULT_RPE * SRPE_TO_TRIMP, 6)
  })
  it('swim: session-RPE even with an HR', () => {
    expect(activityLoad(row({ type: 'Swim', durationS: 45 * 60, perceivedExertion: 5, averageHr: 135 }))).toBeCloseTo(45 * 5 * SRPE_TO_TRIMP, 6)
  })
  it('ride and gym: HR-TRIMP × factor with an HR, session-RPE without', () => {
    expect(activityLoad(row({ type: 'Ride', durationS: 7200, averageHr: 130, perceivedExertion: 4 }))).toBeCloseTo(trimp(7200, 130) * BIKE_LOAD_FACTOR, 6)
    expect(activityLoad(row({ type: 'Ride', durationS: 7200, perceivedExertion: 4 }))).toBeCloseTo(120 * 4 * SRPE_TO_TRIMP, 6)
    expect(activityLoad(row({ type: 'Gym', durationS: 1800, averageHr: 145 }))).toBeCloseTo(trimp(1800, 145) * BIKE_LOAD_FACTOR, 6)
    expect(activityLoad(row({ type: 'Gym', durationS: 1800 }))).toBeCloseTo(30 * DEFAULT_RPE * SRPE_TO_TRIMP, 6)
  })
  it('the scale: an easy hour at RPE 5 ≈ an easy hour by HR', () => {
    const srpe = activityLoad(row({ type: 'Strength', perceivedExertion: 5 }))
    const hr = trimp(3600, 138)                                   // The runner's easy runs: ≈ 1,0 TRIMP/min
    expect(srpe / hr).toBeGreaterThan(0.8)
    expect(srpe / hr).toBeLessThan(1.25)
  })
})

describe('CROSS_LOAD_FROM gate', () => {
  it('cross-training before CROSS_LOAD_FROM carries no load, runs do', () => {
    const before = '1999-12-20'
    expect(before < CROSS_LOAD_FROM).toBe(true)
    expect(activityLoad(row({ date: before, type: 'Strength', perceivedExertion: 8, durationS: 3600 }))).toBe(0)
    expect(activityLoad(row({ date: before, type: 'Ride', averageHr: 140 }))).toBe(0)
    expect(activityLoad(row({ date: CROSS_LOAD_FROM, type: 'Strength', perceivedExertion: 8, durationS: 3600 }))).toBeGreaterThan(0)
    expect(activityLoad(row({ date: before, averageHr: 140 }))).toBeCloseTo(trimp(3600, 140), 6)
  })
  // (Removed in the open-source extraction: the private install's gate sat right after its Porto race; the default gate
  // is 2000-01-01, so no realistic fitness series lies before it.)
  it('after the gate a session shows up in TSB', () => {
    const runs = Array.from({ length: 30 }, (_, i) => row({ date: `2026-11-${String(9 + (i % 20)).padStart(2, '0')}`, averageHr: 140 }))
    const end = parseISO('2026-12-05')
    const base = fitnessSeries(runs, end)
    const more = fitnessSeries([...runs, row({ date: '2026-11-20', type: 'Strength', durationS: 3600, perceivedExertion: 7 })], end)
    const at = (s: typeof base, d: string) => s.find((p) => p.date === d)!
    expect(at(more, '2026-11-20').load).toBeCloseTo(at(base, '2026-11-20').load + 60 * 7 * SRPE_TO_TRIMP, 1)
    expect(at(more, '2026-11-21').tsb).toBeLessThan(at(base, '2026-11-21').tsb)
  })
})

describe('daily loads by sport', () => {
  it('splits a day into sports and agrees with dailyLoads', () => {
    const rows = [
      row({ date: AFTER, averageHr: 140 }),
      row({ date: AFTER, type: 'Strength', durationS: 1800, perceivedExertion: 6 }),
      row({ date: AFTER, type: 'Swim', durationS: 1800, perceivedExertion: 6 }),
    ]
    const by = dailyLoadsBySport(rows)[AFTER]
    expect(by.run).toBeCloseTo(trimp(3600, 140), 6)
    expect(by.strength).toBeCloseTo(30 * 6 * SRPE_TO_TRIMP, 6)
    expect(by.swim).toBeCloseTo(30 * 6 * SRPE_TO_TRIMP, 6)
    expect(by.bike).toBeUndefined()
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBeCloseTo(dailyLoads(rows)[AFTER], 6)
  })
})

describe('manual entry validation', () => {
  const today = '2026-11-20'
  it('accepts a kettlebell session and fills the name', () => {
    const r = parseCrossEntry({ date: '2026-11-19', sport: 'Strength', minutes: 35, rpe: 7 }, today)
    expect(r.ok && r.entry).toEqual({ date: '2026-11-19', type: 'Strength', minutes: 35, rpe: 7, name: 'Kraft' })
  })
  it('refuses minutes 3, RPE 11, an unknown sport and a future date, in German', () => {
    const err = (b: unknown) => { const r = parseCrossEntry(b, today); return r.ok ? null : r.error }
    expect(err({ date: '2026-11-19', sport: 'Strength', minutes: 3, rpe: 6 })).toMatch(/Minuten/)
    expect(err({ date: '2026-11-19', sport: 'Strength', minutes: 30, rpe: 11 })).toMatch(/RPE/)
    expect(err({ date: '2026-11-19', sport: 'Yoga', minutes: 30, rpe: 6 })).toMatch(/Sport/)
    expect(err({ date: '2026-11-21', sport: 'Ride', minutes: 30, rpe: 6 })).toMatch(/Zukunft/)
    expect(err({ date: '19.11.2026', sport: 'Ride', minutes: 30, rpe: 6 })).toMatch(/Datum/)
  })
  it('refuses a day that does not exist and one before any training data', () => {
    const err = (date: string) => { const r = parseCrossEntry({ date, sport: 'Ride', minutes: 30 }, today); return r.ok ? null : r.error }
    expect(err('2026-02-31')).toBe('Datum: diesen Tag gibt es nicht')
    expect(err('2026-00-10')).toBe('Datum: diesen Tag gibt es nicht')
    expect(err('0001-01-01')).toBe('Datum: frühestens 01.01.2000')
    expect(err('2024-02-29')).toBeNull()
    expect(err(today)).toBeNull()
  })
  it('RPE is optional (default applies in the load model)', () => {
    const r = parseCrossEntry({ date: '2026-11-19', sport: 'Swim', minutes: 45 }, today)
    expect(r.ok && r.entry.rpe).toBeNull()
  })
})
