// A move followed by the move back leaves no override behind: the days are at their plan again, so they carry no
// "geändert" mark and the engine may use them. A day the engine changed keeps the edit (the engine's session must not
// reappear under a session that was moved away).
import { describe, expect, it } from 'vitest'
import { applyMove, effectiveSessions, type Overrides } from '@/lib/plan/effective'

describe('Verschieben und zurück', () => {
  // Example block, week of 28.9.: Th 1.10. easy 13 km, Fr 2.10. rest, Mo 5.10. easy 13 km, Tu 6.10. Schwelle 17 km.
  const today = '2026-09-30', THU = '2026-10-01', FRI = '2026-10-02', MON = '2026-10-05', TUE = '2026-10-06'
  const none = new Map<string, number>()
  const plan = effectiveSessions({})

  it('auf den freien Tag und zurück', () => {
    const moved = applyMove({}, THU, FRI, 'move', today, plan, none, plan)
    expect(Object.keys(moved).sort()).toEqual([THU, FRI])
    const back = applyMove(moved, FRI, THU, 'move', today, effectiveSessions(moved), none, plan)
    expect(back).toEqual({})
  })

  it('tauschen und zurücktauschen', () => {
    const swapped = applyMove({}, MON, TUE, 'swap', today, plan, none, plan)
    expect(effectiveSessions(swapped).find((s) => s.date === MON)!.type).toBe('tempo')
    const back = applyMove(swapped, TUE, MON, 'swap', today, effectiveSessions(swapped), none, plan)
    expect(back).toEqual({})
  })

  it('andere Änderungen bleiben', () => {
    const other: Overrides = { '2026-10-07': { date: '2026-10-07', type: 'easy', km: 10, title: 'Ruhiger Lauf' } }
    const moved = applyMove(other, THU, FRI, 'move', today, effectiveSessions(other), none, plan)
    const back = applyMove(moved, FRI, THU, 'move', today, effectiveSessions(moved), none, plan)
    expect(back).toEqual(other)
  })

  it('ein von der Engine belegter Tag behält die Änderung', () => {
    // The engine placed a run on the plan's rest day; moving it away must keep that day free.
    const engine: Overrides = { [FRI]: { date: FRI, type: 'easy', km: 8, title: 'Nachgeholt' } }
    const auto = effectiveSessions({}, engine)
    const moved = applyMove({}, FRI, '2026-10-09', 'move', today, auto, none, auto)
    expect(moved[FRI]?.type).toBe('rest')
    expect(effectiveSessions(moved, engine).find((s) => s.date === FRI)!.type).toBe('rest')
  })
})
