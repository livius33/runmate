// The Shortcut sends numbers as text in the phone's format. Whole-number fields (kcal, resting HR, steps, sleep
// minutes) must read a decimal value as that value, not as its digits glued together ("512,3" kcal is not 5123).
import { describe, expect, it } from 'vitest'
import { parseHealth } from '@/lib/health/parse'

const day = (body: Record<string, unknown>) => {
  const r = parseHealth({ date: '2026-05-10', ...body }, '2026-05-09')
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('Apple Health: ganze Zahlen aus Text', () => {
  it('Dezimalwerte werden gerundet, nicht zusammengezogen', () => {
    const d = day({ activeKcal: '512,3 kcal', restingHr: '52,5', sleepMin: '412.6', steps: 8000 }).day
    expect([d.activeKcal, d.restingHr, d.sleepMin]).toEqual([512, 53, 413])
  })

  it('Tausendertrennzeichen (deutsch und englisch) bleiben Tausender', () => {
    expect(day({ steps: '7.432' }).day.steps).toBe(7432)
    expect(day({ steps: '12,345' }).day.steps).toBe(12345)
    expect(day({ steps: '1.234,6', activeKcal: '1,034.4' }).day).toMatchObject({ steps: 1235, activeKcal: 1034 })
  })

  it('Workouts: kcal und Puls', () => {
    const w = day({ workouts: [{ type: 'Yoga', start: '2026-05-10T08:00:00+02:00', minutes: 30, kcal: '98,7', avgHr: '101,4 bpm' }] }).workouts!
    expect(w[0]).toMatchObject({ kcal: 99, avgHr: 101 })
  })

  // 08-02 follow-up: '2026-02-31', the year 1 and a day far ahead were stored as sent.
  it('Datum: ein echter Kalendertag im erlaubten Zeitraum', () => {
    const err = (date: unknown) => { const r = parseHealth({ date, steps: 8000 }, '2026-05-09', { latest: '2026-05-11' }); return r.ok ? null : r.error }
    expect(err('2026-02-31')).toBe('date: diesen Tag gibt es nicht')
    expect(err('31.02.2026')).toBe('date: diesen Tag gibt es nicht')
    expect(err('0001-01-01')).toBe('date: frühestens 01.01.2000')
    expect(err('2026-05-12')).toBe('date: liegt in der Zukunft')
    expect(err('2999-01-01T08:00:00Z')).toBe('date: liegt in der Zukunft')
    expect(err('morgen')).toBe('date: als JJJJ-MM-TT oder TT.MM.JJJJ')
    for (const ok of ['2026-05-11', '10.05.2026', '10.05.26', '2024-02-29', '2000-01-01', '', undefined]) expect(err(ok), String(ok)).toBeNull()
  })

  it('Workouts mit unmöglichem Startdatum werden übersprungen, die anderen bleiben', () => {
    const w = (start: string) => ({ type: 'Yoga', start, minutes: 30 })
    const r = parseHealth({ date: '2026-05-10', workouts: [w('2026-05-10T08:00:00+02:00'), w('2026-02-31T08:00:00+02:00'), w('0001-01-01T08:00:00Z'), w('2999-01-01 08:00'), w('heute früh')] }, '2026-05-09', { latest: '2026-05-11' })
    if (!r.ok) throw new Error(r.error)
    expect(r.workouts!.map((x) => [x.date, x.start])).toEqual([['2026-05-10', '2026-05-10T08:00:00+02:00'], ['2026-05-10', 'heute früh']])
    expect(r.skipped).toBe(3)
    const runs = parseHealth({ date: '2026-05-10', workouts: [{ type: 'Outdoor Run', start: '2026-02-31T07:00:00+02:00', minutes: 50, distanceKm: 10 }] }, '2026-05-09', { keepRuns: true, latest: '2026-05-11' })
    expect(runs).toMatchObject({ ok: false })                     // nothing left: the run would have carried the impossible day
  })

  it('Text ohne Zahl ist kein Wert (nicht 0)', () => {
    expect(day({ steps: 'keine Daten', restingHr: 50 }).day.steps).toBeNull()
  })
})
