// 07-26 Overlay Wochenfeedback: the stored shape (shared with 07-25), when the overlay opens by itself (incl. KW53 and
// the clock-change weeks, under several process time zones), and the finished week in one view.
import { afterAll, describe, expect, it } from 'vitest'
import { feedbackEntry, storedWeekFeedback, weekError, type WeekFeedbackEntry } from '@/lib/feedback/week'
import { acwrText, feedbackDue, reviewWeekFor, weekOverview } from '@/lib/insights/week-overlay'
import { effectiveSessions, planWeeks } from '@/lib/plan/effective'
import type { PlanWeek } from '@/lib/plan/types'
import type { EngineChange } from '@/lib/plan/engine'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Kiritimati']
const original = process.env.TZ
afterAll(() => { process.env.TZ = original })
const eachZone = (fn: (tz: string) => void) => { for (const tz of ZONES) { process.env.TZ = tz; fn(tz) } }

const entry: WeekFeedbackEntry = { rating: 4, fatigue: 2, note: 'gut', at: '2026-11-02T07:10:00.000Z' }

describe('week_feedback: the stored shape', () => {
  it('a valid store is read as it is', () => {
    expect(storedWeekFeedback({ v: 1, byWeek: { '2026-10-26': entry } })).toEqual({ v: 1, byWeek: { '2026-10-26': entry } })
  })
  it('unreadable entries are dropped, the rest stays; garbage is an empty store', () => {
    const raw = { v: 1, byWeek: { '2026-10-26': entry, '2026-10-19': { rating: 9, fatigue: 1, at: 'x' }, 'montag': entry } }
    expect(storedWeekFeedback(raw)).toEqual({ v: 1, byWeek: { '2026-10-26': entry } })
    expect(storedWeekFeedback(null)).toEqual({ v: 1, byWeek: {} })
    expect(storedWeekFeedback('nope')).toEqual({ v: 1, byWeek: {} })
  })
  it('feedbackEntry trims the note and drops an empty one', () => {
    expect(feedbackEntry({ rating: 3, fatigue: 5, note: '  Longrun verschoben ' }, 'T')).toEqual({ rating: 3, fatigue: 5, note: 'Longrun verschoben', at: 'T' })
    expect(feedbackEntry({ rating: 3, fatigue: 5, note: '   ' }, 'T')).toEqual({ rating: 3, fatigue: 5, at: 'T' })
    expect(feedbackEntry({ rating: 1, fatigue: 1, note: null }, 'T')).toEqual({ rating: 1, fatigue: 1, at: 'T' })
  })
  it('only a finished plan week (its Monday) can be rated', () => {
    const weeks = [{ start: '2026-10-26', end: '2026-11-01' }, { start: '2026-11-02', end: '2026-11-08' }]
    expect(weekError('2026-10-26', '2026-11-02', weeks)).toBeNull()
    expect(weekError('2026-10-27', '2026-11-02', weeks)).toMatch(/Montag/)
    expect(weekError('2026-11-02', '2026-11-08', weeks)).toMatch(/noch nicht vorbei/)
    expect(weekError('2026-11-02', '2026-11-09', weeks)).toBeNull()
  })
})

// Synthetic plan weeks: clock change (25.10.2026 lies in KW43), KW53 over New Year, KW1 2027, spring change (28.3.2027 in KW12).
const wk = (kw: number, start: string, end: string): PlanWeek => ({ kw, start, end, km: 50, focus: `KW ${kw}` })
const WEEKS = [
  wk(43, '2026-10-19', '2026-10-25'), wk(44, '2026-10-26', '2026-11-01'), wk(45, '2026-11-02', '2026-11-08'),
  wk(52, '2026-12-21', '2026-12-27'), wk(53, '2026-12-28', '2027-01-03'), wk(1, '2027-01-04', '2027-01-10'),
  wk(12, '2027-03-22', '2027-03-28'), wk(13, '2027-03-29', '2027-04-04'),
]
const none = {}

describe('When the overlay opens by itself (feedbackDue)', () => {
  it('Monday after the clock change: the review week is KW43, Monday 2.11.: KW44', () => {
    eachZone((tz) => {
      expect({ tz, w: reviewWeekFor('2026-10-26', WEEKS)?.start }).toEqual({ tz, w: '2026-10-19' })
      expect({ tz, kw: feedbackDue({ today: '2026-11-02', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 44 })
    })
  })
  it('a mid-week first visit still offers the week before, until the following Sunday', () => {
    expect(feedbackDue({ today: '2026-11-05', weeks: WEEKS, byWeek: none, dismissed: null })?.kw).toBe(44)
    expect(feedbackDue({ today: '2026-11-08', weeks: WEEKS, byWeek: none, dismissed: null })?.kw).toBe(44)
  })
  it('a week older than the following week is not offered; only the latest finished week counts', () => {
    // KW45 ended 8.11.; a visit on 20.11. offers nothing (KW45 due window closed, no later plan week in the fixture)
    expect(feedbackDue({ today: '2026-11-20', weeks: WEEKS, byWeek: none, dismissed: null })).toBeNull()
    // … and a visit on 9.11. offers KW45, never the skipped KW44
    expect(feedbackDue({ today: '2026-11-09', weeks: WEEKS, byWeek: none, dismissed: null })?.kw).toBe(45)
  })
  it('a stored rating or "Später" keeps it closed for that week', () => {
    expect(feedbackDue({ today: '2026-11-02', weeks: WEEKS, byWeek: { '2026-10-26': entry }, dismissed: null })).toBeNull()
    expect(feedbackDue({ today: '2026-11-02', weeks: WEEKS, byWeek: none, dismissed: '2026-10-26' })).toBeNull()
    expect(feedbackDue({ today: '2026-11-02', weeks: WEEKS, byWeek: none, dismissed: '2026-10-19' })?.kw).toBe(44)
  })
  it('no finished plan week yet: nothing opens', () => {
    expect(feedbackDue({ today: '2026-10-20', weeks: WEEKS, byWeek: none, dismissed: null })).toBeNull()
    expect(reviewWeekFor('2026-10-25', WEEKS)).toBeNull()
  })
  it('KW53: Monday 28.12. reviews KW52; Monday 4.1.2027 reviews KW53 (7 days over New Year); Monday 11.1. KW1', () => {
    eachZone((tz) => {
      expect({ tz, kw: feedbackDue({ today: '2026-12-28', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 52 })
      expect({ tz, kw: feedbackDue({ today: '2027-01-01', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 52 })
      expect({ tz, kw: feedbackDue({ today: '2027-01-04', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 53 })
      expect({ tz, kw: feedbackDue({ today: '2027-01-10', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 53 })
      expect({ tz, kw: feedbackDue({ today: '2027-01-11', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 1 })
    })
  })
  it('spring clock change (28.3.2027): Monday 29.3. reviews KW12, the due window still ends on Sunday 4.4.', () => {
    eachZone((tz) => {
      expect({ tz, kw: feedbackDue({ today: '2027-03-29', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 12 })
      expect({ tz, kw: feedbackDue({ today: '2027-04-04', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 12 })
      expect({ tz, kw: feedbackDue({ today: '2027-04-05', weeks: WEEKS, byWeek: none, dismissed: null })?.kw }).toEqual({ tz, kw: 13 })
    })
  })
})

// Porto KW44 (26.10.–1.11., 70 km, key: Wed Renntempo-Blöcke 2 × 4 km @ 4:23). Runs: Mon 8, Tue 10, Wed 15 (blocks at 4:20),
// Thu 11, Fri 5 on the rest day, Sat long run missed, Sun 10.
const sessions = effectiveSessions({})
const week = planWeeks().find((w) => w.start === '2026-10-26')!
const run = (id: string, date: string, km: number, paceS: number, splits?: number[]) => ({
  id, date, km, paceS, avgHr: 150, name: `Lauf ${id}`, splitPacesS: splits ?? Array.from({ length: Math.floor(km) }, () => paceS),
  splitHrs: Array.from({ length: Math.floor(km) }, () => 150), zonesS: [1800, 1800, 300, 0, 0],
})
const RUNS = [
  run('a', '2026-10-26', 8, 345), run('b', '2026-10-27', 10, 340),
  run('c', '2026-10-28', 15, 300, [340, 340, 340, 260, 260, 260, 260, 320, 260, 260, 260, 260, 340, 340, 340]),
  run('d', '2026-10-29', 11, 345), run('e', '2026-10-30', 5, 350), run('f', '2026-11-01', 10, 270),
]
const FITNESS = ['2026-10-25', '2026-10-26', '2026-10-30', '2026-11-01', '2026-11-02'].map((date, i) => ({ date, ctl: 60 + i, atl: 70 - i * 2, tsb: -10 + i * 3 }))
const CHANGE: EngineChange = {
  id: 'c1', at: '2026-10-30T06:00:00Z', rule: 'rebalance' as EngineChange['rule'], key: 'rebalance:2026-10-26', reason: 'Ausgleich: 2 km auf Donnerstag.',
  before: { '2026-10-29': null }, after: { '2026-10-29': { date: '2026-10-29', type: 'easy', km: 13, title: 'Lockerer Lauf' } }, status: 'active',
}

describe('The finished week in one view (weekOverview)', () => {
  const o = weekOverview({ week, today: '2026-11-02', sessions, runs: RUNS, fitness: FITNESS, engineLog: [CHANGE, { ...CHANGE, id: 'c2', status: 'undone' }], runsSince: '2026-07-01' })

  it('volume, runs and the seven-day strip come from the same day model as the Wochenübersicht', () => {
    expect(o.review.km).toBe(59)
    expect(o.review.targetKm).toBe(70)
    expect(o.review.runs).toBe(6)
    expect(o.plannedRuns).toBe(6)
    expect(o.days.map((d) => d.label)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'])
    expect(o.days.map((d) => d.status)).toEqual(['done', 'done', 'done', 'done', 'extra', 'missed', 'done'])
    expect(o.days[2]).toMatchObject({ key: true, type: 'tempo', plannedKm: 15, actualKm: 15, ran: true, diffKm: null })
    expect(o.days[5]).toMatchObject({ type: 'long', plannedKm: 16, actualKm: 0, ran: false })
  })
  it('key sessions carry the Wochenrückblick verdict', () => {
    expect(o.review.keys).toHaveLength(1)
    expect(o.review.keys[0]).toMatchObject({ date: '2026-10-28', status: 'done' })
    expect(o.review.keys[0].text).toMatch(/^4:20 \(−3 s, im Ziel\)/)
  })
  it('engine reasons of the week, active only', () => {
    expect(o.engine).toEqual([{ id: 'c1', at: '2026-10-30T06:00:00Z', reason: 'Ausgleich: 2 km auf Donnerstag.' }])
  })
  it('notable runs: longest, fastest quality, extra — each once', () => {
    expect(o.notable.map((n) => n.kind)).toEqual(['longest', 'fastest', 'extra'])
    expect(o.notable[0]).toMatchObject({ date: '2026-10-28', text: 'Längster Lauf: Mi. 28.10., 15 km' })
    expect(o.notable[1].text).toBe('Schnellste Qualität: Mi. 28.10., Renntempo-Blöcke 4:20/km (−3 s zum Ziel)')
    expect(o.notable[2].text).toBe('Zusätzlicher Lauf: Fr. 30.10., 5 km ohne geplante Einheit')
  })
  it('load: CTL before the week and at its end, TSB at the end, ACWR from the shared model', () => {
    expect(o.load).toMatchObject({ ctlStart: 60, ctlEnd: 63, atlEnd: 64, tsbEnd: -1 })
    // 7-day km (26.10.–1.11.) = 59; 28-day km = 59 → chronic 14,75 → 4,0
    expect(o.load.acwr).toBe(4)
    expect(acwrText(o.load.acwr)).toBe('deutlich über dem Gewohnten')
    expect(acwrText(null)).toBe('noch keine 4 Wochen Daten')
  })
  it('without 28 days of runs the ACWR stays empty', () => {
    expect(weekOverview({ week, today: '2026-11-02', sessions, runs: RUNS, fitness: FITNESS, engineLog: [], runsSince: '2026-10-20' }).load.acwr).toBeNull()
  })
  it('next week: KW45 with its target and key session', () => {
    expect(o.next).toMatchObject({ kw: 45, km: 30, keys: ['Porto Marathon'] })
  })
  it('a week with one run has no "longest" line; no quality run → no "fastest"', () => {
    const one = weekOverview({ week, today: '2026-11-02', sessions, runs: [RUNS[0]], fitness: [], engineLog: [], runsSince: '2026-07-01' })
    expect(one.notable).toEqual([])
    expect(one.load).toEqual({ ctlStart: null, ctlEnd: null, atlEnd: null, tsbEnd: null, acwr: expect.any(Number) })
  })
})
