// Kettlebell on/off is an edit of the marker, not of the session. It used to store the whole day as shown (on a day
// the engine had changed: the engine's version) as a manual edit: the engine's change stayed frozen after it was taken
// back, and the engine never touched that day again ("the engine never writes a manually edited day").
import { describe, expect, it } from 'vitest'
import { EMPTY_ENGINE, runEngine, undoChange, withoutRebalance, type EngineState } from '@/lib/plan/engine'
import { effectiveSessions, setDayKm, toggleStrength, weekBreakdown, planWeeks, type Overrides } from '@/lib/plan/effective'
import { SavedOverrides } from '@/lib/plan/override-schema'
import { KB } from '@/lib/plan/strength'

// Example block: Mo 28.9. easy 20 km · Tu 29.9. Renntempo-Blöcke 18 km (tempo, key) · We 30.9. easy 14 km.
const MON = '2026-09-28', TUE = '2026-09-29', WED = '2026-09-30'
const RED = { tsb: -30, acwr: 0.9 }, FRESH = { tsb: 0, acwr: 1 }
const run = (manual: Overrides, state: EngineState = EMPTY_ENGINE, fitness = RED) =>
  runEngine({ today: MON, at: 'A', manual, state, runs: [], fitness, syncedThrough: '2026-09-27' })
const at = (manual: Overrides, state: EngineState, d: string) => effectiveSessions(manual, state.overrides).find((s) => s.date === d)!
// What the editor hands to the toggle: the plan as shown, and the plan as shown without manual edits.
const toggle = (manual: Overrides, state: EngineState, d: string) =>
  toggleStrength(manual, d, effectiveSessions(manual, withoutRebalance(state)), effectiveSessions({}, state.overrides))
const roundTrip = (o: Overrides) => SavedOverrides.parse(JSON.parse(JSON.stringify(o))) as Overrides

describe('Kettlebell an einem Tag, den die Engine geändert hat', () => {
  const softened = run({}).state
  const change = softened.log.find((c) => c.rule === 'fatigue' && c.status === 'active')!

  it('der Ermüdungsschutz macht den Dienstag locker (Voraussetzung)', () => {
    expect(at({}, softened, TUE)).toMatchObject({ type: 'easy', km: 12.5, title: 'Locker statt Renntempo-Blöcke' })
    expect(Object.keys(change.after)).toEqual([TUE])
  })

  it('der Marker steht auf dem Tag, wie die Engine ihn zeigt', () => {
    const manual = toggle({}, softened, TUE)
    expect(at(manual, softened, TUE)).toMatchObject({ type: 'easy', km: 12.5, title: 'Locker statt Renntempo-Blöcke', strength: KB.regular })
  })

  it('nimmt die Engine ihre Änderung zurück, zeigt der Tag wieder den Plan – mit Marker', () => {
    const manual = roundTrip(toggle({}, softened, TUE))
    const undone = undoChange(softened, change.id) as EngineState
    expect(at(manual, undone, TUE)).toMatchObject({ type: 'tempo', km: 18, title: 'Renntempo-Blöcke', strength: KB.regular })
  })

  it('der Marker allein hält die Engine nicht vom Tag fern', () => {
    const manual = toggle({}, EMPTY_ENGINE, TUE)                 // marker first, on the plan day
    expect(at(manual, EMPTY_ENGINE, TUE)).toMatchObject({ type: 'tempo', km: 18, strength: KB.regular })
    const r = run(manual)
    expect(r.added.some((c) => c.rule === 'fatigue' && c.status === 'active' && c.after[TUE])).toBe(true)
    expect(at(manual, r.state, TUE)).toMatchObject({ type: 'easy', km: 12.5, strength: KB.regular })
  })

  it('eine Änderung der Einheit von Hand hält sie weiter fern', () => {
    const manual = setDayKm({}, TUE, 16, effectiveSessions({}))
    expect(run(manual).added.some((c) => c.after[TUE])).toBe(false)
  })

  it('noch einmal tippen nimmt den Marker wieder weg, ohne Rest', () => {
    const on = toggle({}, softened, TUE)
    expect(toggle(on, softened, TUE)).toEqual({})
    expect(at(toggle(on, softened, TUE), softened, TUE).strength).toBeUndefined()
  })

  it('eine Änderung der Kilometer danach ist eine Änderung der Einheit und behält den Marker', () => {
    const on = toggle({}, softened, TUE)
    const km = setDayKm(on, TUE, 10, effectiveSessions(on, withoutRebalance(softened)), {}, effectiveSessions({}, softened.overrides))
    expect(km[TUE]).toMatchObject({ type: 'easy', km: 10, strength: KB.regular })
    expect(km[TUE]).not.toHaveProperty('strengthOnly')
    expect(run(km, softened, FRESH).added.some((c) => c.after[TUE])).toBe(false)
    // and the marker off again stays an edit of that day (the km are still yours)
    const off = toggle(km, softened, TUE)
    expect(off[TUE]).toMatchObject({ type: 'easy', km: 10 })
    expect(off[TUE].strength).toBeUndefined()
  })

  it('die Wochen-Aufschlüsselung zählt die km des Tages weiter zur Engine', () => {
    const week = planWeeks().find((w) => w.start === MON)!
    const reasons = new Map([[TUE, change.reason]])
    const plain = weekBreakdown(week, MON, {}, softened.overrides, reasons, new Map())
    const marked = weekBreakdown(week, MON, toggle({}, softened, TUE), softened.overrides, reasons, new Map())
    expect(plain.engineKm).toBe(-5.5)
    expect(marked).toEqual(plain)
  })

  it('ein früher gespeicherter Eintrag (ganzer Tag) bleibt lesbar, wie er ist', () => {
    const old: Overrides = { [WED]: { date: WED, type: 'easy', km: 14, title: 'Ruhiger Lauf', strength: KB.regular } }
    expect(roundTrip(old)).toEqual(old)
    expect(at(old, softened, WED)).toMatchObject({ km: 14, strength: KB.regular })
  })
})
