// Krank / Pause (07-08 AC-3/AC-4): paused days are rest, the return is graded, nothing is ever added, anchors stay.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDays, format, parseISO } from 'date-fns'
import { effectiveSessions, dayState } from '@/lib/plan/effective'
import { pauseLayer, returnText, RETURN_RULES, type Pause } from '@/lib/plan/pause'
import { allSessions } from '@/lib/plan/blocks'
import type { PlanSession } from '@/lib/plan/types'

const RUNS = Number(process.env.FC_RUNS ?? 200)
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined
const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const base = effectiveSessions({})
const at = (list: PlanSession[], d: string) => list.find((s) => s.date === d)
const runKm = (s?: PlanSession) => (s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)
const layerOf = (pauses: Pause[], today: string) => pauseLayer(new Map(allSessions().map((s) => [s.date, s])), { pauses, today })

describe('Krank / Pause (AC-3)', () => {
  it('ohne Pause: Plan unverändert', () => {
    expect(effectiveSessions({}, {}, { pauses: [], today: '2026-10-10' })).toEqual(base)
  })

  it('Krank 5.–8.10.: Ruhetage mit Markierung, Status „paused“, keine offenen km', () => {
    const p: Pause = { id: 'p1', kind: 'krank', from: '2026-10-05', to: '2026-10-08' }
    const eff = effectiveSessions({}, {}, { pauses: [p], today: '2026-10-12' })
    for (let d = '2026-10-05'; d <= '2026-10-08'; d = day(d, 1)) {
      expect(at(eff, d)).toMatchObject({ type: 'rest', title: 'Krank', paused: 'krank' })
      expect(dayState(d, '2026-10-12', eff, new Map())).toMatchObject({ status: 'paused', openKm: 0 })
    }
  })

  it('feste Termine bleiben: Hella-HM und das Rennen', () => {
    const p: Pause = { id: 'p', kind: 'pause', from: '2026-10-23', to: '2026-11-09' }
    const eff = effectiveSessions({}, {}, { pauses: [p], today: '2026-10-23' })
    expect(at(eff, '2026-10-25')).toEqual(at(base, '2026-10-25'))
    expect(at(eff, '2026-11-08')).toEqual(at(base, '2026-11-08'))
    expect(layerOf([p], '2026-10-23').windows[0]).toMatchObject({ raceInPause: true, replan: true })
  })

  it('offene Pause reicht bis heute; ab morgen gilt der Wiedereinstieg', () => {
    const p: Pause = { id: 'p', kind: 'krank', from: '2026-10-05', to: null }
    const w = layerOf([p], '2026-10-07').windows[0]
    expect(w).toMatchObject({ end: '2026-10-07', returnDay: '2026-10-08', days: 3 })
  })

  it('manuelle Änderung auf einem Krank-Tag: Krank gewinnt', () => {
    const p: Pause = { id: 'p', kind: 'krank', from: '2026-10-05', to: '2026-10-06' }
    const eff = effectiveSessions({ '2026-10-05': { date: '2026-10-05', type: 'easy', km: 12, title: 'x' } }, {}, { pauses: [p], today: '2026-10-06' })
    expect(at(eff, '2026-10-05')?.type).toBe('rest')
  })

  it('Text: Praxiswerte, Fieber-Regel, km der Wochen', () => {
    const p: Pause = { id: 'p', kind: 'krank', from: '2026-10-05', to: '2026-10-08' }
    const t = returnText(layerOf([p], '2026-10-08').windows[0])
    expect(t).toMatch(/Zurück nach 4 Tagen Krankheit, Wiedereinstieg am 9\.10\./)
    expect(t).toMatch(/Praxiswerte, keine Studienergebnisse/)
    expect(t).toMatch(/Fieber/)
  })
})

describe('Wiedereinstieg (AC-4, Eigenschaften)', () => {
  const pauseArb = fc.record({
    start: fc.integer({ min: 0, max: 50 }), len: fc.integer({ min: 1, max: 20 }), open: fc.boolean(),
    kind: fc.constantFrom('krank' as const, 'pause' as const), todayOffset: fc.integer({ min: 0, max: 25 }),
  })
  it('nie mehr km als ohne Pause, Anker bleiben, Woche 1 locker ≤ 70 %, Woche 2 ≤ 90 % ohne Renntempo', () => {
    fc.assert(fc.property(pauseArb, ({ start, len, open, kind, todayOffset }) => {
      const from = day('2026-09-28', start)
      const p: Pause = { id: 'p', kind, from, to: open ? null : day(from, len - 1) }
      const today = day(from, todayOffset)
      const eff = effectiveSessions({}, {}, { pauses: [p], today })
      const w = layerOf([p], today).windows[0]
      for (const s of base) {
        const e = at(eff, s.date)!
        expect(runKm(e), s.date).toBeLessThanOrEqual(runKm(s) + 1e-9)
        if (s.anchor || s.type === 'race') expect(e).toEqual(s)
      }
      for (let d = from; d <= w.end; d = day(d, 1)) {
        const s = at(base, d)
        if (s && !(s.anchor || s.type === 'race')) expect(at(eff, d)?.paused).toBe(kind)
      }
      const fixed = (s?: PlanSession) => !!s && (s.anchor || s.type === 'race')
      const week = (a: string) => Array.from({ length: 7 }, (_, i) => at(eff, day(a, i))).filter((s) => !fixed(s))
      const w1 = week(w.returnDay), w2 = week(day(w.returnDay, 7))
      const maxRun = Math.max(RETURN_RULES.minRunKm, Math.floor((45 * 60 / 345) * 2) / 2)
      expect(w1.reduce((t, s) => t + runKm(s), 0)).toBeLessThanOrEqual(w.week1Km + 1e-9)
      for (const s of w1) {
        if (!s || !runKm(s)) continue
        expect(s.type, s.date).toBe('easy')
        expect(s.km!).toBeLessThanOrEqual(maxRun)
      }
      expect(w2.reduce((t, s) => t + runKm(s), 0)).toBeLessThanOrEqual(w.week2Km + 1e-9)
      for (const s of w2) {
        if (!s || !runKm(s)) continue
        expect(s.type === 'tempo' && s.pace === '4:23', s.date).toBe(false)
        if (s.type === 'long' && w.longKm > 0) expect(s.km!).toBeLessThanOrEqual(Math.max(RETURN_RULES.minRunKm, w.longKm))
      }
      return true
    }), { numRuns: RUNS, seed })
  })

  it('Pause löschen = Plan wie vorher (auch mit manuellen Änderungen und Engine)', () => {
    const manual = { '2026-10-29': { date: '2026-10-29', type: 'easy' as const, km: 9, title: 'x' } }
    const engine = { '2026-10-28': { date: '2026-10-28', type: 'easy' as const, km: 10, title: 'weicher' } }
    expect(effectiveSessions(manual, engine, { pauses: [], today: '2026-10-27' })).toEqual(effectiveSessions(manual, engine))
  })
})
