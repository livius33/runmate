// "Automatisch: …" and "Von dir angepasst." under a session said the wrong thing in two cases. A day whose only edit is
// the kettlebell marker read as a session the runner changed; and on the plan card a day the engine changed kept
// reading "Automatisch" after the runner had put an own session on top of it (the week editor said the opposite). One
// rule now: a manual edit of the session makes the day yours, a marker alone changes nothing about whose day it is.
import { describe, expect, it } from 'vitest'
import { changeWhy, changedBy, effectiveSessions, setDayKm, toggleStrength } from '@/lib/plan/effective'
import { todayInsight } from '@/lib/insights/today'
import type { EngineChange } from '@/lib/plan/engine'

describe('Wessen Änderung ein Tag zeigt', () => {
  // Example block: Th 1.10. easy 13 km. The engine shortened it to 9 km.
  const THU = '2026-10-01'
  const REASON = 'Form im roten Bereich'
  const engine = { [THU]: { date: THU, type: 'easy' as const, km: 9, title: 'Lockerer Lauf' } }
  const plan = effectiveSessions({})
  const auto = effectiveSessions({}, engine)
  const marker = toggleStrength({}, THU, auto, auto)
  const own = setDayKm({}, THU, 11, auto, {}, auto)

  it('nur der Kettlebell-Marker: keine geänderte Einheit', () => {
    expect(marker[THU].strengthOnly).toBe(true)
    expect(changedBy(marker[THU], false)).toBeNull()
    expect(changeWhy(marker[THU])).toEqual([])
  })

  it('Marker auf einem Tag, den die Automatik geändert hat: weiter die Änderung der Automatik', () => {
    expect(effectiveSessions(marker, engine).find((s) => s.date === THU)).toMatchObject({ km: 9 })
    expect(changedBy(marker[THU], true)).toBe('engine')
    expect(changeWhy(marker[THU], REASON)).toEqual([`Automatisch: ${REASON}`])
  })

  it('eigene Einheit auf einem Tag der Automatik: deine Änderung, sie liegt obenauf', () => {
    expect(effectiveSessions(own, engine).find((s) => s.date === THU)).toMatchObject({ km: 11 })
    expect(changedBy(own[THU], true)).toBe('manual')
    expect(changeWhy(own[THU], REASON)).toEqual(['Von dir angepasst.'])
  })

  it('ohne eigene Änderung: Automatik oder nichts', () => {
    expect([changedBy(undefined, true), changedBy(undefined, false)]).toEqual(['engine', null])
    expect([changeWhy(undefined, REASON), changeWhy(undefined)]).toEqual([[`Automatisch: ${REASON}`], []])
    expect(changeWhy(setDayKm({}, THU, 11, plan, {}, plan)[THU])).toEqual(['Von dir angepasst.'])
  })

  it('Heute-Karte: dieselbe Regel', () => {
    const change: EngineChange = { id: 'c1', at: '2026-09-30T06:00:00Z', rule: 'fatigue', key: `fatigue:${THU}`, reason: REASON, before: { [THU]: null }, after: engine, status: 'active' }
    const why = (manual: typeof marker, engineLog: EngineChange[]) =>
      todayInsight({ today: THU, sessions: effectiveSessions(manual, engineLog.length ? engine : {}), manual, engineLog, runs: [], tsb: 0, acwr: null }).why
    expect(why(toggleStrength({}, THU, plan, plan), [])).toEqual([])
    expect(why(marker, [change])).toEqual([REASON])
    expect(why(own, [change])).toEqual(['Von dir angepasst.'])
    expect(why({}, [change])).toEqual([REASON])
  })
})
