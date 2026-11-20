// A kettlebell marker set by hand on a rest day belongs to that day: a run moved onto the day keeps it ("Kettlebell
// nach dem Lauf"). Only a key day takes none (strength.ts: never on a race, a test or a key long run itself).
import { describe, expect, it } from 'vitest'
import { applyMove, effectiveSessions, toggleStrength } from '@/lib/plan/effective'
import { KB } from '@/lib/plan/strength'

describe('Verschieben auf einen Ruhetag mit Kettlebell', () => {
  // Example block: Th 1.10. easy 13 km, Fr 2.10. rest, Sa 3.10. Longrun mit Renntempo 30 km (key).
  const today = '2026-09-30', THU = '2026-10-01', FRI = '2026-10-02', SAT = '2026-10-03'
  const none = new Map<string, number>()
  const plan = effectiveSessions({})
  const marked = toggleStrength({}, FRI, plan)
  const at = (list: ReturnType<typeof effectiveSessions>, d: string) => list.find((s) => s.date === d)!

  it('der Ruhetag trägt den Marker (Voraussetzung)', () => {
    expect(at(effectiveSessions(marked), FRI)).toMatchObject({ type: 'rest', strength: KB.regular })
  })

  it('der verschobene Lauf behält den Marker des Tages', () => {
    const moved = effectiveSessions(applyMove(marked, THU, FRI, 'move', today, effectiveSessions(marked), none, plan))
    expect(at(moved, FRI)).toMatchObject({ type: 'easy', km: 13, strength: KB.regular })
    expect(at(moved, THU).type).toBe('rest')
  })

  it('ein eigener Marker des Laufs bleibt, wie er ist', () => {
    const own = toggleStrength(marked, THU, effectiveSessions(marked))
    const optional = { ...own, [THU]: { ...own[THU], strength: KB.optional } }
    const moved = effectiveSessions(applyMove(optional, THU, FRI, 'move', today, effectiveSessions(optional), none, plan))
    expect(at(moved, FRI).strength).toEqual(KB.optional)
  })

  it('nachgeholte Kilometer auf dem Ruhetag behalten ihn auch', () => {
    // Thursday run in part (6 of 13 km); the rest goes onto Friday.
    const friday = '2026-10-02'
    const actual = new Map([[THU, 6]])
    const moved = effectiveSessions(applyMove(marked, THU, FRI, 'merge', friday, effectiveSessions(marked), actual, plan))
    expect(at(moved, FRI)).toMatchObject({ type: 'easy', km: 7, title: 'Nachholen', strength: KB.regular })
  })

  it('ein Schlüssel-Longrun bekommt keinen Marker', () => {
    const moved = effectiveSessions(applyMove(marked, SAT, FRI, 'move', today, effectiveSessions(marked), none, plan))
    expect(at(moved, FRI)).toMatchObject({ type: 'long', km: 30 })
    expect(at(moved, FRI).strength).toBeUndefined()
  })
})
