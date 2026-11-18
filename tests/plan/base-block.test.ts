// Rolling base block (07-17): gaps between blocks get base weeks from the recent volume — ≥ 30 km, +5 %/week, ≤ proven,
// every 4th week at 80 %, one key session, long-run caps — and past weeks never change as time passes.
import { longShare } from '@/lib/plan/generator/days'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDays, format, getISODay, parseISO } from 'date-fns'
import { BASE, baseBlocks, baseGaps, baseWeekKm, type BaseRun } from '@/lib/plan/base-block'
import { PORTO_2026, RECOVERY_END } from '@/examples/porto-2026/plan'
import { parseStructure, totalKm } from '@/lib/plan/structure'
import type { TrainingBlock } from '@/lib/plan/types'
import type { AthleteProfile, Weekday } from '@/lib/plan/athlete-profile'

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const goal = (planStart: string, end: string): TrainingBlock => ({ ...PORTO_2026, handWritten: undefined, id: `g-${planStart}`, goalId: 'g', planStart, end, weeks: [], sessions: [],
  race: { ...PORTO_2026.race, date: day(end, -14) } })
const steady = (from: string, to: string, kmPerDay: number): BaseRun[] => {
  const out: BaseRun[] = []
  for (let d = from; d <= to; d = day(d, 1)) if (getISODay(parseISO(d)) !== 5) out.push({ date: d, km: kmPerDay })
  return out
}

describe('Lücken (AC-1, AC-3)', () => {
  it('nach Porto bis 4 Wochen voraus; zwischen zwei Blöcken genau die Lücke; keine Lücke unter einer Woche', () => {
    expect(baseGaps([PORTO_2026], '2026-12-02')).toEqual([{ start: day(RECOVERY_END, 1), end: '2027-01-03', before: PORTO_2026 }])   // Sunday of today + 27
    const hm = goal('2026-12-14', '2027-03-14')
    expect(baseGaps([PORTO_2026, hm], '2026-12-02').map((g) => [g.start, g.end])).toEqual([['2026-11-30', '2026-12-13']])
    expect(baseGaps([PORTO_2026, goal('2026-11-30', '2027-03-14')], '2026-12-02')).toEqual([])
    // after the last block: only once the horizon reaches past its end
    expect(baseGaps([PORTO_2026, hm], '2027-03-01').map((g) => [g.start, g.end])).toEqual([['2026-11-30', '2026-12-13'], ['2027-03-15', '2027-03-28']])
  })
  it('pausiert: kein Grundlagenblock', () => {
    expect(baseBlocks({ blocks: [PORTO_2026], runs: [], today: '2026-12-02', profile: null, settings: { v: 1, paused: true, capKm: null } })).toEqual([])
  })
})

describe('Wochenumfang (AC-1, AC-2)', () => {
  const gap = { start: '2026-11-30', end: '2027-01-24' }       // 8 weeks
  it('Start bei den letzten 3 Wochen, +5 %/Woche bis zum gehaltenen Umfang, jede 4. Woche 80 %', () => {
    const runs = [...steady('2026-01-05', '2026-09-27', 13), ...steady('2026-11-09', '2026-11-29', 8)]   // proven ≈ 78, recent 48
    const w = baseWeekKm(gap, runs, '2026-11-30')
    expect(w.map((x) => x.km)).toEqual([48, 50, 52.5, 44, 58, 61, 64, 54])
    expect(w.map((x) => x.cutback)).toEqual([false, false, false, true, false, false, false, true])
  })
  it('mindestens 30 km, höchstens Deckel; eine zu kurze Woche senkt die nächste', () => {
    expect(baseWeekKm(gap, [], '2026-11-30')[0].km).toBe(30)
    const runs = steady('2026-01-05', '2026-11-29', 8)        // ≈ 48/week
    expect(baseWeekKm(gap, runs, '2026-11-30', 40).every((x) => x.km <= 40)).toBe(true)
    const short = [...runs, { date: '2026-12-01', km: 12 }]   // week 1 (plan 48) run 12 km
    const w = baseWeekKm(gap, short, '2026-12-08')
    expect(w[0].km).toBe(48)
    expect(w[1].km).toBe(30)                                   // 48 × 12/48 × 1.05 = 12.6 → floor 30
  })
})

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
const caseArb = fc.record({
  daily: fc.array(fc.integer({ min: 0, max: 30 }), { minLength: 420, maxLength: 420 }),
  gapWeeks: fc.option(fc.integer({ min: 1, max: 12 }), { nil: null }),       // null = open-ended after Porto
  todayOffset: fc.integer({ min: 0, max: 120 }),
  later: fc.integer({ min: 1, max: 60 }),
  avail: fc.option(fc.subarray(WEEKDAYS, { minLength: 3, maxLength: 7 }), { nil: null }),
  longPick: fc.nat(), cap: fc.option(fc.integer({ min: 20, max: 120 }), { nil: null }),
})

describe('Zufällige Läufe, Lücken und Profile (AC-1, AC-2)', () => {
  it('jede Regel hält; vergangene Wochen ändern sich nicht', () => {
    fc.assert(fc.property(caseArb, (c) => {
      const first = day(RECOVERY_END, -419 + 120)
      const allRuns: BaseRun[] = c.daily.map((km, i) => ({ date: day(first, i), km: km / 2 })).filter((r) => r.km > 0)
      const blocks = c.gapWeeks ? [PORTO_2026, goal(day(RECOVERY_END, 1 + 7 * c.gapWeeks), day(RECOVERY_END, 7 * c.gapWeeks + 7 * 12))] : [PORTO_2026]
      const profile: AthleteProfile | null = c.avail ? {
        v: 1, age: null, weightKg: null, heightCm: null, experience: null, weeklyKm: null, availableDays: c.avail,
        longRunDay: c.avail[c.longPick % c.avail.length], qualityDays: [], kbDays: [], restDay: null, maxKmWeekday: null, maxKmWeekend: null,
        fitnessMethod: null, thresholdPaceS: null, fiveKS: null, savedAt: null,
      } : null
      const settings = { v: 1 as const, paused: false, capKm: c.cap }
      const at = (today: string) => baseBlocks({ blocks, runs: allRuns.filter((r) => r.date < today), today, profile, settings })
      const today = day(RECOVERY_END, c.todayOffset - 30)
      const out = at(today)
      for (const b of out) {
        expect(b.base).toBe(true)
        expect(blocks.some((x) => !(b.planStart > x.end || b.end < x.planStart))).toBe(false)            // never overlaps a goal block
        const target = baseWeekKm({ start: b.planStart, end: b.end }, allRuns.filter((r) => r.date < today), today, c.cap)
        expect(b.weeks.length).toBe(target.length)
        expect(b.sessions.length).toBe(7 * b.weeks.length)
        b.weeks.forEach((w, k) => {
          const t = target[k]
          const cap = Math.max(BASE.minKm, c.cap ?? Infinity)
          expect(t.km).toBeGreaterThanOrEqual((t.cutback ? BASE.minKm * BASE.cutbackShare : BASE.minKm) - 0.5)
          if (c.cap != null) expect(t.km).toBeLessThanOrEqual(cap + 1e-9)
          if (k > 0 && !t.cutback && !target[k - 1].cutback) expect(t.km).toBeLessThanOrEqual(Math.max(BASE.minKm, target[k - 1].km * (1 + BASE.growth)) + 0.5)
          expect(t.cutback).toBe((k + 1) % BASE.cutbackEvery === 0)
          const ss = b.sessions.filter((s) => s.date >= w.start && s.date <= w.end)
          const sum = ss.reduce((a, s) => a + (s.km ?? 0), 0)
          expect(Math.abs(sum - w.km)).toBeLessThan(0.05)
          expect(w.km).toBeLessThanOrEqual(t.km + 0.05)
          expect(ss.filter((s) => s.key).length).toBe(t.cutback ? 0 : ss.filter((s) => s.key).length)
          expect(ss.filter((s) => s.key).length).toBeLessThanOrEqual(1)
          const longest30 = Math.max(0, ...allRuns.filter((r) => r.date < today && r.date >= day(w.start, -30) && r.date < w.start).map((r) => r.km))
          for (const s of ss) {
            if (s.type === 'long') {
              expect(s.km!).toBeLessThanOrEqual(Math.min(longShare(BASE.longShare, t.km) * t.km, BASE.longSpike * longest30, BASE.longMaxKm) + 1e-9)
            }
            if (s.type === 'tempo') expect(totalKm(parseStructure(s.notes)!)).toBeCloseTo(s.km!, 5)
            if (s.type !== 'rest') expect(s.km!).toBeGreaterThanOrEqual(BASE.minRunKm)
          }
        })
      }
      // Later, with more runs: every week that had started stays the same.
      const later = day(today, c.later)
      const next = at(later)
      for (const b of out) {
        const n = next.find((x) => x.planStart === b.planStart)!
        expect(n, b.id).toBeDefined()
        const started = (s: { date: string }) => s.date < day(mondayOf(today), 7)
        expect(n.sessions.filter(started)).toEqual(b.sessions.filter(started))
      }
    }), { numRuns: 300 })
  })
})
const mondayOf = (d: string) => day(d, 1 - getISODay(parseISO(d)))
