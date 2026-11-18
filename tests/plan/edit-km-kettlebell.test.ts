// A kettlebell marker set by hand on a rest day belongs to that day: km typed in for the day make it an easy run and
// keep the marker ("Kettlebell nach dem Lauf"), as a run moved onto the day does. Back at 0 km the day is a plain rest
// day again, as "Ruhetag" in the editor makes it.
import { describe, expect, it } from 'vitest'
import { effectiveSessions, setDayKm, toggleStrength } from '@/lib/plan/effective'
import { KB } from '@/lib/plan/strength'

describe('Kilometer auf einem Ruhetag mit Kettlebell', () => {
  // Example block: Th 1.10. easy 13 km, Fr 2.10. rest.
  const THU = '2026-10-01', FRI = '2026-10-02'
  const plan = effectiveSessions({})
  const marked = toggleStrength({}, FRI, plan)
  const at = (list: ReturnType<typeof effectiveSessions>, d: string) => list.find((s) => s.date === d)!

  it('der Ruhetag trägt nur den Marker (Voraussetzung)', () => {
    expect(marked[FRI]).toMatchObject({ type: 'rest', strength: KB.regular, strengthOnly: true })
  })

  it('der neue lockere Lauf behält den Marker des Tages', () => {
    const next = setDayKm(marked, FRI, 8, effectiveSessions(marked), {}, plan)
    expect(at(effectiveSessions(next), FRI)).toMatchObject({ type: 'easy', km: 8, title: 'Locker', strength: KB.regular })
    expect(next[FRI].strengthOnly).toBeUndefined()            // now a session edit, not a marker alone
  })

  it('ohne Marker entsteht auch keiner', () => {
    const next = setDayKm({}, FRI, 8, plan, {}, plan)
    expect(at(effectiveSessions(next), FRI).strength).toBeUndefined()
  })

  it('0 km: der Tag ist wieder ein Ruhetag ohne Marker', () => {
    const run = setDayKm(marked, FRI, 8, effectiveSessions(marked), {}, plan)
    const rest = setDayKm(run, FRI, 0, effectiveSessions(run), {}, plan)
    expect(at(effectiveSessions(rest), FRI).type).toBe('rest')
    expect(at(effectiveSessions(rest), FRI).strength).toBeUndefined()
  })

  it('ein Lauf mit Marker behält ihn bei neuen Kilometern', () => {
    const own = toggleStrength({}, THU, plan)
    const next = setDayKm(own, THU, 10, effectiveSessions(own), {}, plan)
    expect(at(effectiveSessions(next), THU)).toMatchObject({ type: 'easy', km: 10, strength: KB.regular })
  })
})
