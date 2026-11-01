// Property tests for paces + workouts (07-13 AC-3): random templates, profiles, skeletons and goals. Every plan keeps
// checkWorkouts() and checkDays(); same input → same output; never a throw.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDays, format, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { buildSkeleton } from '@/lib/plan/generator/skeleton'
import { buildDays } from '@/lib/plan/generator/days'
import { trainingPaces, RACE_KM } from '@/lib/plan/generator/paces'
import { buildWorkouts, type WorkoutsInput } from '@/lib/plan/generator/workouts'
import type { AthleteProfile, Weekday } from '@/lib/plan/athlete-profile'
import { checkDays } from './days-check'
import { checkWorkouts } from './workouts-check'

const RUNS = 500
const TEMPLATES = listMethodologies().valid.map((m) => m.params)
const day = (base: string, n: number) => format(addDays(parseISO(base), n), 'yyyy-MM-dd')
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

const caseArb = fc.record({
  t: fc.integer({ min: 0, max: TEMPLATES.length - 1 }),
  startDay: fc.integer({ min: 0, max: 2 * 365 }),
  weeks: fc.integer({ min: 6, max: 26 }),
  raceDow: fc.integer({ min: 0, max: 6 }),
  currentKm: fc.integer({ min: 40, max: 200 }).map((n) => n / 2),
  avail: fc.subarray(WEEKDAYS, { minLength: 3, maxLength: 7 }),
  longPick: fc.nat(), restPick: fc.nat(),
  quality: fc.subarray(WEEKDAYS, { maxLength: 3 }),
  caps: fc.option(fc.tuple(fc.integer({ min: 8, max: 40 }), fc.integer({ min: 8, max: 40 })), { nil: null }),
  goalPaceS: fc.integer({ min: 190, max: 330 }),
  threshold: fc.option(fc.integer({ min: 180, max: 330 }), { nil: null }),
  race: fc.option(fc.record({ distanceKm: fc.constantFrom(5, 10, 21.0975), paceS: fc.integer({ min: 180, max: 330 }) }), { nil: null }),
  longest30Km: fc.integer({ min: 5, max: 35 }),
})

describe('Einheiten: zufällige Vorlagen, Profile, Gerüste und Ziele', () => {
  it('gültige Einheiten, Tage unverändert, deterministisch', () => {
    fc.assert(fc.property(caseArb, (c) => {
      const template = TEMPLATES[c.t]
      const distance = template.distances[0]
      const start = day('2026-01-05', c.startDay)
      const raceDate = day(start, c.weeks * 7 + c.raceDow)
      const sk = buildSkeleton({ template, distance, start, raceDate, currentKm: c.currentKm })
      fc.pre(sk.ok)
      if (!sk.ok) return
      const off = WEEKDAYS.filter((d) => !c.avail.includes(d))
      const profile: AthleteProfile = {
        v: 1, age: null, weightKg: null, heightCm: null, experience: null, weeklyKm: null, availableDays: c.avail,
        longRunDay: c.avail[c.longPick % c.avail.length], qualityDays: c.quality.filter((d) => c.avail.includes(d)), kbDays: [],
        restDay: off.length ? off[c.restPick % off.length] : null, maxKmWeekday: c.caps?.[0] ?? null, maxKmWeekend: c.caps?.[1] ?? null,
        fitnessMethod: null, thresholdPaceS: c.threshold, fiveKS: null, savedAt: null,
      }
      const input: WorkoutsInput = { template, distance, raceDate, goalS: c.goalPaceS * RACE_KM[distance], profile,
        recentRace: c.race ? { distanceKm: c.race.distanceKm, timeS: c.race.paceS * c.race.distanceKm, date: start } : null }
      const daysIn = { ...input, racePaceS: trainingPaces(input).racePaceS, longest30Km: c.longest30Km }
      const days = buildDays(sk, daysIn)
      fc.pre(days.ok)
      if (!days.ok) return
      const w = buildWorkouts(days, sk, input)
      expect(w.ok).toBe(true)
      if (!w.ok) return
      expect(checkWorkouts(w, days, sk, input)).toEqual([])
      expect(checkDays({ ...days, sessions: w.sessions }, sk, daysIn)).toEqual([])
      expect(buildWorkouts(days, sk, structuredClone(input))).toEqual(w)
    }), { numRuns: RUNS })
  })
})
