// A fresh install: no plan file registered, no generated block live. Every lookup must still answer, and nothing
// may count as "after the race" or as plan history.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  NO_BLOCK, activeBlock, allSessions, blockPaces, blocks, firstPlanStart, hasBlocks, isAfterRace, raceOf,
  registerBuiltInBlocks, registerLiveBlocks,
} from '@/lib/plan/blocks'
import { effectiveSessions, planWeeks } from '@/lib/plan/effective'
import { rulesFor, DEFAULT_PACES, DEFAULT_RULES } from '@/lib/plan/rules'
import { baseBlocks } from '@/lib/plan/base-block'
import { raceWeekPhase } from '@/lib/plan/race-week'
import { allGoals, storedGoals } from '@/lib/season/goals'
import { todayInsight } from '@/lib/insights/today'
import { racePrediction } from '@/lib/insights/prediction'
import { raceReadiness } from '@/lib/insights/readiness'
import { recoveryStatus } from '@/lib/insights/recovery'
import { baseStatus } from '@/lib/insights/base'
import { PORTO_2026 } from '@/examples/porto-2026/plan'

const TODAY = '2027-03-10'

beforeAll(() => { registerBuiltInBlocks([]); registerLiveBlocks([]) })
afterAll(() => registerBuiltInBlocks([PORTO_2026]))   // tests/setup.ts registers the example for all other tests

describe('ohne Trainingsblock', () => {
  it('Registry leer, NO_BLOCK als Platzhalter', () => {
    expect(blocks()).toEqual([])
    expect(hasBlocks()).toBe(false)
    expect(activeBlock(TODAY)).toBe(NO_BLOCK)
    expect(raceOf(TODAY)).toBe(NO_BLOCK.race)
    expect(isAfterRace(TODAY)).toBe(false)
    expect(firstPlanStart() > TODAY).toBe(true)
  })

  it('kein Plan, keine Wochen, Standardregeln und -tempi', () => {
    expect(allSessions()).toEqual([])
    expect(effectiveSessions({}, {}, { pauses: [], today: TODAY })).toEqual([])
    expect(planWeeks()).toEqual([])
    expect(rulesFor(TODAY)).toBe(DEFAULT_RULES)
    expect(blockPaces(TODAY)).toEqual(DEFAULT_PACES)
    expect(raceWeekPhase(TODAY)).toBe('none')
  })

  it('keine Saisonziele und keine Grundlagenblöcke ohne Zielblock', () => {
    expect(allGoals(storedGoals(null))).toEqual([])
    expect(baseBlocks({ blocks: [], runs: [], today: TODAY, profile: null })).toEqual([])
  })

  it('die Karten der Startseite rechnen ohne Plan (sie werden vor dem Leerzustand berechnet)', () => {
    expect(() => todayInsight({ today: TODAY, sessions: [], manual: {}, engineLog: [], runs: [], tsb: null, acwr: null })).not.toThrow()
    const prediction = racePrediction({ today: TODAY, sessions: [], runs: [] })
    expect(() => raceReadiness({ today: TODAY, sessions: [], runs: [], prediction, fitness: [], acwr: null })).not.toThrow()
    expect(() => recoveryStatus({ today: TODAY, sessions: [], runs: [], fitness: [] })).not.toThrow()
    expect(() => baseStatus({ today: TODAY, sessions: [], runs: [] })).not.toThrow()
  })
})
