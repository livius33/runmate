// A swap or a move writes two days. When one of them alone falls back to the plan file's day, the session that was
// swapped away comes back there while it still sits on the other day: the same hard session twice. Two ways led there:
// "Original wiederherstellen" (and "Woche zurücksetzen" for a swap across two weeks) dropped one day's edit only, and
// "Tempolauf" on the day that had received the easy run fell back to the plan day (no kept session, `was`).
import { describe, expect, it } from 'vitest'
import {
  applyMove, effectiveSessions, isHard, planWeeks, resetWeek, restoreDay, setDayKm, setPace, setZone2, z2State, type Overrides,
} from '@/lib/plan/effective'
import type { PlanSession } from '@/lib/plan/types'

// Example block: Sa 3.10. Longrun mit Renntempo 30 km · Mo 5.10. easy 13 km, Tu 6.10. Schwelle 17 km, We 7.10. easy
// 14 km, Fr 9.10. rest.
const today = '2026-09-30', SAT = '2026-10-03', MON = '2026-10-05', TUE = '2026-10-06', WED = '2026-10-07', FRI = '2026-10-09'
const none = new Map<string, number>()
const plan = effectiveSessions({})
const at = (list: PlanSession[], d: string) => list.find((s) => s.date === d)!
const hardDays = (o: Overrides) => effectiveSessions(o).filter((s) => s.date >= SAT && s.date <= FRI && isHard(s.was ?? s)).map((s) => s.date)
const swapped = applyMove({}, MON, TUE, 'swap', today, plan, none, plan)
const moved = applyMove({}, TUE, FRI, 'move', today, plan, none, plan)

describe('Getauschte Einheit: ein Tag zurück auf den Plan', () => {
  it('nach dem Tausch liegt die Schwelle am Montag (Voraussetzung)', () => {
    expect(at(effectiveSessions(swapped), MON)).toMatchObject({ type: 'tempo', title: 'Schwelle' })
    expect(at(effectiveSessions(swapped), TUE)).toMatchObject({ type: 'easy', km: 13 })
    expect(hardDays(swapped)).toEqual([SAT, MON])
  })

  it('ein Tag allein ohne Änderung zeigt die Schwelle doppelt oder gar nicht (Ursache)', () => {
    const { [TUE]: _tue, ...onlyMon } = swapped
    const { [MON]: _mon, ...onlyTue } = swapped
    expect(hardDays(onlyMon)).toEqual([SAT, MON, TUE])
    expect(hardDays(onlyTue)).toEqual([SAT])
  })

  it('„Original wiederherstellen“ nimmt den Tausch auf beiden Tagen zurück', () => {
    expect(restoreDay(swapped, TUE)).toEqual({})
    expect(restoreDay(swapped, MON)).toEqual({})
  })

  it('ebenso nach dem Verschieben auf den Ruhetag', () => {
    expect(hardDays(moved)).toEqual([SAT, FRI])
    expect(restoreDay(moved, TUE)).toEqual({})
    expect(restoreDay(moved, FRI)).toEqual({})
  })

  it('auch wenn die getauschte Schwelle inzwischen auf Zone 2 steht', () => {
    const z2 = setZone2(swapped, MON, effectiveSessions(swapped))
    expect(z2[MON].was?.title).toBe('Schwelle')
    expect(restoreDay(z2, TUE)).toEqual({})
  })

  it('andere Änderungen bleiben', () => {
    const other = setDayKm(swapped, WED, 10, effectiveSessions(swapped), {}, plan)
    expect(restoreDay(other, TUE)).toEqual({ [WED]: other[WED] })
    expect(restoreDay(other, WED)).toEqual(swapped)
  })

  it('„Woche zurücksetzen“ nimmt einen Tausch über die Wochengrenze ganz zurück', () => {
    const across = applyMove({}, SAT, MON, 'swap', today, plan, none, plan)   // Longrun ↔ Monday's easy run
    expect(at(effectiveSessions(across), MON).title).toBe('Longrun mit Renntempo')
    const week = planWeeks().find((w) => w.start === '2026-09-28')!
    expect(resetWeek(week, across)).toEqual({})
  })
})

describe('Getauschte Einheit: „Tempolauf“ am Tag mit dem lockeren Lauf', () => {
  it('holt die Schwelle nicht ein zweites Mal', () => {
    const shown = effectiveSessions(swapped)
    const next = setPace(swapped, TUE, shown, plan)
    expect(hardDays(next)).toEqual([SAT, MON])
    expect(next).toEqual(swapped)
    expect(z2State(at(shown, TUE), TUE, shown)).toBeNull()      // the day offers no switch
    expect(z2State(at(shown, MON), MON, shown)).toBe('pace')    // the swapped session itself still does
  })

  it('auch wenn die Schwelle vor dem Tausch auf Zone 2 stand', () => {
    const z2 = setZone2({}, TUE, plan)
    const both = applyMove(z2, MON, TUE, 'swap', today, effectiveSessions(z2), none, plan)
    expect(at(effectiveSessions(both), MON).was?.title).toBe('Schwelle')
    const shown = effectiveSessions(both)
    expect(z2State(at(shown, TUE), TUE, shown)).toBeNull()
    expect(hardDays(setPace(both, TUE, shown, plan))).toEqual([SAT, MON])
  })

  it('auch nach Verschieben auf den Ruhetag und neuen Kilometern am alten Tag', () => {
    const again = setDayKm(moved, TUE, 8, effectiveSessions(moved), {}, plan)
    const shown = effectiveSessions(again)
    expect(at(shown, TUE)).toMatchObject({ type: 'easy', km: 8 })
    expect(z2State(at(shown, TUE), TUE, shown)).toBeNull()
    expect(hardDays(setPace(again, TUE, shown, plan))).toEqual([SAT, FRI])
  })

  it('der Rückgriff auf den Plan bleibt, wenn die Einheit nirgends sonst liegt', () => {
    // An easy run entered by hand on the Schwelle day (no kept session): "Tempolauf" brings the plan day back.
    const byHand: Overrides = { [TUE]: { date: TUE, type: 'easy', km: 10, title: 'Locker' } }
    const shown = effectiveSessions(byHand)
    expect(z2State(at(shown, TUE), TUE, shown)).toBe('z2')
    expect(setPace(byHand, TUE, shown, plan)).toEqual({})
    expect(restoreDay(byHand, TUE)).toEqual({})
  })
})
