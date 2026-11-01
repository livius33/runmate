// Property tests for the day plan (07-03 AC-3): random profiles × templates × skeletons. Every result is a plan that
// keeps checkDays() or a German error — never a throw; same input → same output.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDays, format, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { buildSkeleton } from '@/lib/plan/generator/skeleton'
import { buildDays, type DaysInput } from '@/lib/plan/generator/days'
import type { AthleteProfile, Weekday } from '@/lib/plan/athlete-profile'
import { checkDays } from './days-check'

const RUNS = 500
const TEMPLATES = listMethodologies().valid.map((m) => m.params)
const day = (base: string, n: number) => format(addDays(parseISO(base), n), 'yyyy-MM-dd')
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

const profileArb: fc.Arbitrary<AthleteProfile> = fc.record({
  avail: fc.subarray(WEEKDAYS, { minLength: 3, maxLength: 7 }),
  longPick: fc.nat(),
  restPick: fc.nat(),
  quality: fc.subarray(WEEKDAYS, { maxLength: 3 }),
  weekday: fc.option(fc.integer({ min: 8, max: 40 }), { nil: null }),
  weekend: fc.option(fc.integer({ min: 8, max: 40 }), { nil: null }),
  experience: fc.constantFrom('novice', 'intermediate', 'advanced', 'elite', null),
}).map((c) => {
  const off = WEEKDAYS.filter((d) => !c.avail.includes(d))
  return {
    v: 1, age: null, weightKg: null, heightCm: null, experience: c.experience as AthleteProfile['experience'], weeklyKm: null,
    availableDays: c.avail, longRunDay: c.avail[c.longPick % c.avail.length], qualityDays: c.quality.filter((d) => c.avail.includes(d)),
    kbDays: [], restDay: off.length ? off[c.restPick % off.length] : null, maxKmWeekday: c.weekday, maxKmWeekend: c.weekend,
    fitnessMethod: null, thresholdPaceS: null, fiveKS: null, savedAt: null,
  }
})

const caseArb = fc.record({
  t: fc.integer({ min: 0, max: TEMPLATES.length - 1 }),
  startDay: fc.integer({ min: 0, max: 2 * 365 }),
  weeks: fc.integer({ min: 6, max: 26 }),
  raceDow: fc.integer({ min: 0, max: 6 }),
  currentKm: fc.integer({ min: 40, max: 200 }).map((n) => n / 2),
  provenOver: fc.double({ min: 0, max: 1, noNaN: true }),
  profile: profileArb,
  racePaceS: fc.integer({ min: 180, max: 330 }),
  longest30Km: fc.integer({ min: 5, max: 35 }),
  longest12mKm: fc.option(fc.integer({ min: 10, max: 45 }), { nil: null }),
})

describe('Tagesplan: zufällige Profile, Vorlagen und Gerüste', () => {
  it('liefert einen gültigen Plan oder einen deutschen Fehler, nie eine Ausnahme', () => {
    fc.assert(fc.property(caseArb, (c) => {
      const template = TEMPLATES[c.t]
      const distance = template.distances[0]
      const start = day('2026-01-05', c.startDay)
      const raceDate = day(start, c.weeks * 7 + c.raceDow)
      const sk = buildSkeleton({ template, distance, start, raceDate, currentKm: c.currentKm, provenKm: c.currentKm * (1 + c.provenOver) })
      fc.pre(sk.ok)
      if (!sk.ok) return
      const input: DaysInput = { template, distance, raceDate, racePaceS: c.racePaceS, profile: c.profile, longest30Km: c.longest30Km, longest12mKm: c.longest12mKm }
      const r = buildDays(sk, input)
      if (!r.ok) expect(r.error).toMatch(/^Zu wenige Lauftage/)
      else expect(checkDays(r, sk, input)).toEqual([])
      expect(buildDays(sk, structuredClone(input))).toEqual(r)
    }), { numRuns: RUNS })
  })
})
