// Krank/Pause wins over manual edits, so a session moved onto a paused day would vanish: such a day is no target.
import { describe, expect, it } from 'vitest'
import { applyMove, effectiveSessions, moveModes } from '@/lib/plan/effective'
import type { Pause } from '@/lib/plan/pause'

describe('Verschieben und Pause', () => {
  // Example block: Fr 2.10. rest day, Mo 5.10. easy 13 km. Pause entered through Fr 2.10.; today is We 30.9.
  const today = '2026-09-30', PAUSED = '2026-10-02', RUN = '2026-10-05'
  const pause = { pauses: [{ id: 'p', kind: 'pause', from: '2026-09-30', to: PAUSED } as Pause], today }
  const sessions = effectiveSessions({}, {}, pause)
  const none = new Map<string, number>()
  const runKm = (list: typeof sessions) => list.filter((s) => s.type !== 'rest' && s.type !== 'race').reduce((t, s) => t + (s.km ?? 0), 0)

  it('ein pausierter Tag ist kein Ziel', () => {
    expect(sessions.find((s) => s.date === PAUSED)?.paused).toBe('pause')
    expect(moveModes(RUN, PAUSED, today, sessions, none)).toEqual([])
  })

  it('kein Lauf geht beim Verschieben verloren', () => {
    const moved = applyMove({}, RUN, PAUSED, 'move', today, sessions, none)
    expect(runKm(effectiveSessions(moved, {}, pause))).toBe(runKm(sessions))
  })
})
