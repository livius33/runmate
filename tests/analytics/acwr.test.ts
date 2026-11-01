// ACWR windows (logic audit 2026-10-26, finding 8): 7 and 28 calendar days including today.
import { describe, expect, it } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { acwr, acwrSeries } from '@/lib/analytics/load'

const today = '2026-10-26'
const daily = (n: number, km = 10) => Array.from({ length: n }, (_, i) => ({ date: format(addDays(parseISO(today), -i), 'yyyy-MM-dd'), distanceM: km * 1000 }))

describe('ACWR', () => {
  it('gleiche km jeden Tag: genau 1,0', () => {
    const r = acwr(daily(60), parseISO(today))
    expect(r.acuteKm).toBe(70)
    expect(r.chronicKm).toBe(70)
    expect(r.acwr).toBe(1)
  })
  it('der Lauf vor 7 Tagen zählt nicht mehr akut, der vor 28 Tagen nicht mehr chronisch', () => {
    const at = (n: number) => [{ date: format(addDays(parseISO(today), -n), 'yyyy-MM-dd'), distanceM: 10000 }]
    expect(acwr(at(6), parseISO(today)).acuteKm).toBe(10)
    expect(acwr(at(7), parseISO(today)).acuteKm).toBe(0)
    expect(acwr(at(27), parseISO(today)).chronicKm).toBe(2.5)
    expect(acwr(at(28), parseISO(today)).chronicKm).toBe(0)
  })
})

describe('ACWR-Verlauf (07-23)', () => {
  it('heute zuerst, jeder Tag wie acwr() an diesem Tag', () => {
    const runs = [...daily(40), { date: today, distanceM: 30000 }]
    const s = acwrSeries(runs, parseISO(today))
    expect(s).toHaveLength(3)
    const upTo = (i: number) => runs.filter((r) => r.date <= format(addDays(parseISO(today), -i), 'yyyy-MM-dd'))
    for (let i = 0; i < 3; i++) expect(s[i]).toBe(acwr(upTo(i), addDays(parseISO(today), -i)).acwr)
    expect(s[1]).toBe(1)                                                            // yesterday does not see today's 30 km
    expect(s[0]!).toBeGreaterThan(s[1]!)
  })
  it('ohne chronische km: null', () => {
    expect(acwrSeries([], parseISO(today), 2)).toEqual([null, null])
  })
})
