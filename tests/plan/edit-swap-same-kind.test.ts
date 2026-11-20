// 08-02 follow-up: the two days of a swap or a move are found by the kind of session (type, title, pace), not its km.
// With two sessions of one kind in reach (two easy runs titled "Lockerer Lauf") "Original wiederherstellen" missed the
// partner of a swap of two easy runs (one run then showed twice), or took along a day of another edit (a run was lost).
// Where the kind leaves a choice, the km decide.
import { describe, expect, it } from 'vitest'
import { applyMove, effectiveSessions, restoreDay, type Overrides } from '@/lib/plan/effective'

describe('Tausch und Verschieben mit gleichnamigen Einheiten', () => {
  // Example block: Tu 20.10. Lockerer Lauf 16 km, Th 22.10. Lockerer Lauf 13 km, Fr 23.10. rest,
  // We 28.10. Renntempo-Blöcke 15 km.
  const today = '2026-10-19', TUE = '2026-10-20', THU = '2026-10-22', FRI = '2026-10-23', WED2 = '2026-10-28'
  const none = new Map<string, number>()
  const plan = effectiveSessions({})
  const move = (o: Overrides, from: string, to: string, mode: 'move' | 'swap') => applyMove(o, from, to, mode, today, effectiveSessions(o), none, plan)
  const km = (o: Overrides, d: string) => effectiveSessions(o).find((s) => s.date === d)!.km ?? 0

  it('zwei lockere Läufe getauscht: Original wiederherstellen an einem Tag stellt beide wieder her', () => {
    const swapped = move({}, TUE, THU, 'swap')
    expect([km(swapped, TUE), km(swapped, THU)]).toEqual([13, 16])
    expect(restoreDay(swapped, TUE)).toEqual({})
    expect(restoreDay(swapped, THU)).toEqual({})
  })

  it('ein verschobener lockerer Lauf und ein Tausch mit einem anderen: jeder Tag nimmt nur seinen Partner mit', () => {
    const moved = move({}, THU, FRI, 'move')                      // 13 km to Friday
    const both = move(moved, TUE, WED2, 'swap')                   // 16 km ↔ tempo 15 km
    expect(Object.keys(both).sort()).toEqual([TUE, THU, FRI, WED2])
    // Restoring the swap leaves the move as it is (the 13 km stay on Friday) …
    expect(restoreDay(both, TUE)).toEqual(moved)
    expect(restoreDay(both, WED2)).toEqual(moved)
    // … and restoring the move leaves the swap (the tempo run stays on Tuesday, the 16 km on 28.10.).
    const swapOnly = move({}, TUE, WED2, 'swap')
    expect(restoreDay(both, FRI)).toEqual(swapOnly)
    expect(restoreDay(both, THU)).toEqual(swapOnly)
  })
})
