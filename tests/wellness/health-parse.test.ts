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

  it('Text ohne Zahl ist kein Wert (nicht 0)', () => {
    expect(day({ steps: 'keine Daten', restingHr: 50 }).day.steps).toBeNull()
  })
})
