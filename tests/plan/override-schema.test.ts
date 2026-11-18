// The save schema of manual plan edits keeps every field an edit carries (08-01): a kettlebell marker switched on and
// the pace session behind a Zone 2 day survive the round trip through PUT /api/running/plan-overrides.
import { describe, expect, it } from 'vitest'
import { SavedOverrides, SavedSession } from '@/lib/plan/override-schema'
import { KB } from '@/lib/plan/strength'
import { effectiveSessions, setPace, setZone2, toggleStrength, z2State } from '@/lib/plan/effective'
import type { PlanSession } from '@/lib/plan/types'

// What the API stores and the next GET returns.
const roundTrip = (o: Record<string, PlanSession>) => SavedOverrides.parse(JSON.parse(JSON.stringify(o))) as Record<string, PlanSession>

describe('Gespeicherte Planänderungen behalten alle Felder', () => {
  const sessions = effectiveSessions({})
  const today = sessions[0].date

  it('Kettlebell an bleibt an; wieder aus = keine Änderung mehr (AC-1)', () => {
    const day = sessions.find((s) => s.type === 'easy' && (s.km ?? 0) > 0 && !s.strength && !s.anchor)!
    const on = roundTrip(toggleStrength({}, day.date, sessions))
    expect(on[day.date].strength).toEqual(KB.regular)
    const after = effectiveSessions(on)
    expect(after.find((s) => s.date === day.date)!.strength).toEqual(KB.regular)
    expect(roundTrip(toggleStrength(on, day.date, after))).toEqual({})
  })

  it('Zone 2 behält die Tempo-Einheit und stellt sie wieder her (AC-2)', () => {
    const tempo = sessions.find((s) => z2State(s, today) === 'pace')!
    const z2 = roundTrip(setZone2({}, tempo.date, sessions))
    expect(z2[tempo.date].was?.title).toBe(tempo.title)
    const after = effectiveSessions(z2)
    expect(z2State(after.find((s) => s.date === tempo.date), today)).toBe('z2')
    // back to the pace session exactly as the plan showed it
    const back = roundTrip(setPace(z2, tempo.date, after))
    expect(effectiveSessions(back).find((s) => s.date === tempo.date)).toEqual(tempo)
  })

  it('Test- und Termin-Kennzeichen bleiben', () => {
    const s: PlanSession = { date: '2026-10-25', type: 'race', km: 21.1, title: 'HM', anchor: true, test: 'Finaler Test', key: true }
    expect(SavedSession.parse(s)).toEqual(s)
  })

  it('Unsinn wird abgelehnt, „paused" nie gespeichert (AC-3)', () => {
    const ok: PlanSession = { date: '2026-10-01', type: 'easy', km: 8, title: 'Locker' }
    expect(SavedSession.safeParse({ ...ok, type: 'swim' }).success).toBe(false)
    expect(SavedSession.safeParse({ ...ok, km: 80 }).success).toBe(false)
    expect(SavedSession.safeParse({ ...ok, strength: { minMin: 30, maxMin: 600 } }).success).toBe(false)
    expect(SavedSession.parse({ ...ok, paused: 'krank' })).toEqual(ok)
  })
})
