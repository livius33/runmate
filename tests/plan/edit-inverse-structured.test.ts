// An edit followed by its inverse leaves no override behind — also on a structured session whose workout text the
// plan fits to its km (the plan file says "4 ein … 2 aus", the plan shows "2,5 ein … 1,5 aus").
import { describe, expect, it } from 'vitest'
import { allSessions } from '@/lib/plan/blocks'
import { effectiveSessions, setDayKm, setPace, setZone2, toggleStrength } from '@/lib/plan/effective'

describe('Änderung und zurück: strukturierte Einheit', () => {
  const D = '2026-09-29'   // example block: Renntempo-Blöcke, 18 km
  const plan = effectiveSessions({})
  const shown = plan.find((s) => s.date === D)!

  it('die gezeigte Einheit weicht im Text von der Plan-Datei ab (Voraussetzung)', () => {
    expect(shown.notes).not.toBe(allSessions().find((s) => s.date === D)!.notes)
  })

  it('Zone 2 und zurück zum Tempolauf', () => {
    const z2 = setZone2({}, D, plan)
    expect(z2[D].type).toBe('easy')
    expect(setPace(z2, D, effectiveSessions(z2))).toEqual({})
  })

  it('Kettlebell an und wieder aus', () => {
    const on = toggleStrength({}, D, plan)
    expect(on[D].strength).toBeTruthy()
    expect(toggleStrength(on, D, effectiveSessions(on))).toEqual({})
  })

  it('km ändern und zurück auf den Planwert', () => {
    const edited = setDayKm({}, D, 20, plan)
    expect(edited[D].km).toBe(20)
    expect(setDayKm(edited, D, shown.km!, effectiveSessions(edited))).toEqual({})
  })
})
