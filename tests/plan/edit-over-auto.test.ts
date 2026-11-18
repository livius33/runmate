// A manual edit that lands on the plan file's own value must still show on a day the engine or a return cap changes:
// dropping the edit there would leave the automatic version in place and the edit would do nothing.
import { describe, expect, it } from 'vitest'
import { effectiveSessions, setDayKm, setPace, z2State, type Overrides } from '@/lib/plan/effective'
import type { Pause } from '@/lib/plan/pause'
import type { PlanSession } from '@/lib/plan/types'

const at = (list: PlanSession[], d: string) => list.find((s) => s.date === d)!
const plan = effectiveSessions({})

describe('Änderung auf einem automatisch angepassten Tag', () => {
  it('km zurück auf den Planwert, während die Engine Ausgleichs-km aufgeschlagen hat', () => {
    const D = '2026-10-01'   // example block: Lockerer Lauf 13 km
    const engine: Overrides = { [D]: { ...at(plan, D), km: 14, notes: '+1 km Ausgleich' } }
    const shown = effectiveSessions({}, engine)          // what the page shows
    const base = effectiveSessions({}, {})               // what edits work on: without the Ausgleich km
    expect(at(shown, D).km).toBe(14)
    const next = setDayKm({}, D, 13, base, {}, shown)
    expect(at(effectiveSessions(next, engine), D).km).toBe(13)
  })

  it('ohne automatische Änderung bleibt es dabei: zurück zum Plan = keine Änderung', () => {
    const D = '2026-10-01'
    const edited = setDayKm({}, D, 15, plan, {}, plan)
    expect(setDayKm(edited, D, 13, effectiveSessions(edited), {}, plan)).toEqual({})
  })

  it('Tempolauf zurückholen, nachdem der Ermüdungsschutz die Einheit locker gemacht hat', () => {
    const D = '2026-10-06'   // example block: Schwelle 17 km
    const engine: Overrides = { [D]: { date: D, type: 'easy', km: 12, title: 'Locker statt Schwelle', notes: 'Ermüdungsschutz (TSB −32) · geplant war: Schwelle (17 km)' } }
    const shown = effectiveSessions({}, engine)
    expect(z2State(at(shown, D), D)).toBe('z2')         // the day offers "Tempolauf"
    const next = setPace({}, D, shown, shown)
    expect(at(effectiveSessions(next, engine), D)).toMatchObject({ type: 'tempo', km: 17, title: 'Schwelle' })
  })

  it('km zurück auf den Planwert in der zweiten Woche nach einer Pause', () => {
    const today = '2026-09-25'
    const pause = { pauses: [{ id: 'p', kind: 'krank', from: '2026-09-21', to: '2026-09-24' } as Pause], today }
    const shown = effectiveSessions({}, {}, pause)
    // a return-week-2 day (2.–8.10.) whose km the cap lowered and nothing else
    const capped = shown.find((s) => s.date >= '2026-10-02' && s.date <= '2026-10-08' && s.type !== 'rest' &&
      s.type === at(plan, s.date).type && s.title === at(plan, s.date).title && s.notes === at(plan, s.date).notes &&
      (s.km ?? 0) < (at(plan, s.date).km ?? 0))
    expect(capped).toBeTruthy()
    const D = capped!.date, km = at(plan, D).km!
    const next = setDayKm({}, D, km, shown, {}, shown)
    expect(at(effectiveSessions(next, {}, pause), D).km).toBe(km)
  })
})
