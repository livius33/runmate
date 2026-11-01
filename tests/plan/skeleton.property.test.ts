// Property tests for the week skeleton (07-02 AC-3): random races, athletes and templates. Every result is either a
// skeleton that keeps checkSkeleton() or a German error — never a throw, never an invalid plan.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDays, format, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { buildSkeleton, type SkeletonInput } from '@/lib/plan/generator/skeleton'
import { checkSkeleton } from './skeleton-check'

const RUNS = 500
const TEMPLATES = listMethodologies().valid.map((m) => m.params)
const day = (base: string, n: number) => format(addDays(parseISO(base), n), 'yyyy-MM-dd')

const inputArb: fc.Arbitrary<SkeletonInput> = fc.record({
  t: fc.integer({ min: 0, max: TEMPLATES.length - 1 }),
  startDay: fc.integer({ min: 0, max: 3 * 365 - 30 * 7 }),
  weeks: fc.integer({ min: 4, max: 30 }),
  raceDow: fc.integer({ min: 0, max: 6 }),
  currentKm: fc.integer({ min: 30, max: 240 }).map((n) => n / 2),
  provenOver: fc.option(fc.double({ min: 0, max: 1.5, noNaN: true }), { nil: undefined }),
  peakOver: fc.option(fc.double({ min: 0.8, max: 2.5, noNaN: true }), { nil: undefined }),
  tuneUps: fc.array(fc.integer({ min: 0, max: 210 }), { maxLength: 2 }),
  experience: fc.constantFrom('novice', 'intermediate', 'advanced', 'elite', null),
  age: fc.option(fc.integer({ min: 18, max: 75 }), { nil: undefined }),
}).map((c) => {
  const template = TEMPLATES[c.t]
  const start = day('2026-01-05', c.startDay)
  const raceDate = day(start, c.weeks * 7 + c.raceDow)
  return {
    template, distance: template.distances[0], start, raceDate, currentKm: c.currentKm,
    provenKm: c.provenOver == null ? undefined : c.currentKm * (1 + c.provenOver),
    peakKm: c.peakOver == null ? undefined : Math.round(c.currentKm * c.peakOver),
    tuneUps: c.tuneUps.map((n) => day(start, n)).filter((d) => d < raceDate),
    experience: c.experience as SkeletonInput['experience'], age: c.age,
  }
})

describe('Wochengerüst: zufällige Rennen, Läufer und Vorlagen', () => {
  it('liefert ein gültiges Gerüst oder einen deutschen Fehler, nie eine Ausnahme', () => {
    fc.assert(fc.property(inputArb, (input) => {
      const r = buildSkeleton(input)
      if (!r.ok) expect(r.error).toMatch(/^(Mindestens \d+ Wochen bis zum Rennen|Die Vorlage „.+“ hat keinen Plan für)/)
      else expect(checkSkeleton(r, input)).toEqual([])
    }), { numRuns: RUNS })
  })
  it('gleiche Eingabe → gleiches Gerüst', () => {
    fc.assert(fc.property(inputArb, (input) => {
      expect(buildSkeleton(input)).toEqual(buildSkeleton(structuredClone(input)))
    }), { numRuns: RUNS })
  })
  it('die empfohlene Spitze steigt nie, wenn der gehaltene Umfang sinkt', () => {
    fc.assert(fc.property(inputArb, fc.double({ min: 0, max: 1, noNaN: true }), (input, f) => {
      const a = buildSkeleton({ ...input, peakKm: undefined })
      const lower = input.currentKm + ((input.provenKm ?? input.currentKm) - input.currentKm) * f
      const b = buildSkeleton({ ...input, peakKm: undefined, provenKm: lower })
      if (a.ok && b.ok) expect(b.peak.recommendedKm).toBeLessThanOrEqual(a.peak.recommendedKm)
    }), { numRuns: RUNS })
  })
})
