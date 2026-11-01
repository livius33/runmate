// 07-24: the Wochenübersicht marks every day with a run, shorter or longer than planned.
import { describe, expect, it } from 'vitest'
import { applyMove, dayState, effectiveSessions, runMark } from '@/lib/plan/effective'
import type { PlanSession } from '@/lib/plan/types'

const today = '2026-12-14'   // Monday after the test week
const s = (date: string, km: number): PlanSession => ({ date, type: 'easy', km, title: 'Locker' })
const sessions = [s('2026-12-08', 10), s('2026-12-09', 10), s('2026-12-10', 10), s('2026-12-12', 10)]
const actual = new Map([['2026-12-08', 12], ['2026-12-09', 6], ['2026-12-10', 10], ['2026-12-11', 5]])
const day = (d: string) => dayState(d, today, sessions, actual)

describe('Wochenübersicht: every run day is marked (07-24)', () => {
  it('longer, shorter, exact and extra runs are all marked as run', () => {
    expect(runMark(day('2026-12-08'))).toEqual({ ran: true, diffKm: 2 })
    expect(runMark(day('2026-12-09'))).toEqual({ ran: true, diffKm: -4 })
    expect(runMark(day('2026-12-10'))).toEqual({ ran: true, diffKm: null })
    expect(runMark(day('2026-12-11'))).toEqual({ ran: true, diffKm: null })   // run on a rest day
  })

  it('a missed day and a rest day are not marked', () => {
    expect(runMark(day('2026-12-12'))).toEqual({ ran: false, diffKm: null })
    expect(runMark(day('2026-12-13'))).toEqual({ ran: false, diffKm: null })
  })

  it('a difference below 0,5 km is not shown', () => {
    expect(runMark(dayState('2026-12-10', today, sessions, new Map([['2026-12-10', 9.6]])))).toEqual({ ran: true, diffKm: null })
    expect(runMark(dayState('2026-12-10', today, sessions, new Map([['2026-12-10', 10.4]])))).toEqual({ ran: true, diffKm: null })
    expect(runMark(dayState('2026-12-10', today, sessions, new Map([['2026-12-10', 9.5]])))).toEqual({ ran: true, diffKm: -0.5 })
  })

  it('plan statuses stay as before (partial keeps its open km for moving and rebalance)', () => {
    expect(day('2026-12-08')).toMatchObject({ status: 'done', openKm: 0 })
    expect(day('2026-12-09')).toMatchObject({ status: 'partial', openKm: 4 })
    expect(day('2026-12-10')).toMatchObject({ status: 'done', openKm: 0 })
    expect(day('2026-12-11')).toMatchObject({ status: 'extra', openKm: 0 })
    expect(day('2026-12-12')).toMatchObject({ status: 'missed', openKm: 10 })
  })

  it('a swapped session is marked on the day it was run', () => {
    // Porto week KW41: swap two run days, run only the later one
    const base = effectiveSessions({})
    const week = base.filter((x) => x.date >= '2026-10-05' && x.date <= '2026-10-11' && (x.km ?? 0) > 0 && x.type !== 'race' && !x.anchor)
    const [a, b] = week
    const t = a.date
    const manual = applyMove({}, a.date, b.date, 'swap', t, base, new Map())
    const eff = effectiveSessions(manual)
    expect(eff.find((x) => x.date === b.date)?.km).toBe(a.km)
    const ran = new Map([[b.date, a.km!]])
    expect(runMark(dayState(b.date, '2026-10-12', eff, ran))).toEqual({ ran: true, diffKm: null })
    expect(runMark(dayState(a.date, '2026-10-12', eff, ran)).ran).toBe(false)
  })
})
