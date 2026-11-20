// A rebuild takes the manual edits from its cut (a Monday) away, an undo gives them back. A swap or a move can reach
// across that Monday: taken apart, the day before the cut keeps the other day's session while its own is gone (shown
// twice after an undo that returned only one half, or not at all after the rebuild). Both halves go and come together.
import { describe, expect, it } from 'vitest'
import { applyMove, effectiveSessions, setDayKm, toggleStrength } from '@/lib/plan/effective'
import { editsBack, splitManual } from '@/lib/plan/rebuild'

describe('Neuaufbau: eigene Änderungen gehen und kommen in ganzen Paaren', () => {
  // Example block: Th 1.10. easy 13 km, Fr 2.10. rest, Sa 3.10. Longrun mit Renntempo 30 km, Mo 5.10. easy 13 km,
  // Fr 9.10. rest. The cut is Monday 5.10.
  const today = '2026-09-30', THU = '2026-10-01', FRI = '2026-10-02', SAT = '2026-10-03', MON = '2026-10-05', FRI2 = '2026-10-09'
  const CUT = '2026-10-05', END = '2026-11-29'
  const none = new Map<string, number>()
  const plan = effectiveSessions({})
  const swapped = applyMove({}, SAT, MON, 'swap', today, plan, none, plan)
  const moved = applyMove({}, SAT, FRI2, 'move', today, plan, none, plan)

  it('ein Tausch über den Schnitt geht als Ganzes', () => {
    const { kept, removed } = splitManual(swapped, CUT, END)
    expect([Object.keys(kept), Object.keys(removed).sort()]).toEqual([[], [SAT, MON]])
  })

  it('eine verschobene Einheit auch', () => {
    const { kept, removed } = splitManual(moved, CUT, END)
    expect([Object.keys(kept), Object.keys(removed).sort()]).toEqual([[], [SAT, FRI2]])
  })

  it('andere Änderungen vor dem Schnitt bleiben: Kilometer, Kettlebell', () => {
    const more = toggleStrength(setDayKm(swapped, THU, 10, effectiveSessions(swapped), {}, plan), FRI, plan)
    expect(Object.keys(splitManual(more, CUT, END).kept).sort()).toEqual([THU, FRI])
  })

  it('Rückgängig in derselben Woche: beide Tage kommen zurück', () => {
    expect(editsBack(swapped, {}, CUT, CUT, plan)).toEqual(swapped)
  })

  it('Rückgängig eine Woche später: der Montag bleibt wie neu gebaut, also kommt auch der Samstag nicht zurück', () => {
    expect(editsBack(swapped, {}, CUT, '2026-10-12', plan)).toEqual({})
    expect(Object.keys(editsBack(moved, {}, CUT, '2026-10-12', plan))).toEqual([])
  })

  it('Rückgängig nach einer neuen Änderung am Samstag: die bleibt, der Montag kommt nicht allein zurück', () => {
    const since = setDayKm({}, SAT, 24, plan, {}, plan)
    expect(editsBack(swapped, since, CUT, CUT, plan)).toEqual({})
  })

  it('eine einzelne Änderung nach dem Schnitt kommt wie bisher zurück', () => {
    const km = setDayKm({}, MON, 10, plan, {}, plan)
    expect(editsBack(km, {}, CUT, CUT, plan)).toEqual(km)
    expect(editsBack(km, {}, CUT, '2026-10-12', plan)).toEqual({})
  })
})
