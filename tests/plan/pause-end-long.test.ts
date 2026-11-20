// An open Krank/Pause period that has run for more than 90 days must still take its end ("Wieder fit ab"): the
// 90-day limit bounds how far a period may be entered ahead, not how long an open one has already lasted.
import { describe, expect, it } from 'vitest'
import { pauseError, type Pause } from '@/lib/plan/pause'

describe('Lange offene Pause beenden', () => {
  const today = '2026-10-21'
  const open: Pause = { id: 'p', kind: 'pause', from: '2026-07-01', to: null }   // 112 days ago, still open
  const LIMIT = 'Höchstens 90 Tage am Stück.'

  it('eine seit über 90 Tagen offene Pause lässt sich beenden', () => {
    expect(pauseError({ ...open, to: '2026-10-20' }, [], today, true)).toBeNull()
    expect(pauseError({ ...open, to: today }, [], today, true)).toBeNull()
  })

  it('auch mit „Wieder fit ab“ in ein paar Tagen', () => {
    expect(pauseError({ ...open, to: '2026-10-25' }, [], today, true)).toBeNull()
  })

  it('weiter als 90 Tage voraus bleibt begrenzt', () => {
    expect(pauseError({ ...open, to: '2027-01-19' }, [], today, true)).toBeNull()      // today + 90
    expect(pauseError({ ...open, to: '2027-01-20' }, [], today, true)).toBe(LIMIT)
  })

  it('eine gespeicherte Pause, die noch nicht begonnen hat, zählt ab ihrem Start', () => {
    const ahead: Pause = { id: 'a', kind: 'pause', from: '2026-11-01', to: '2026-11-05' }
    expect(pauseError({ ...ahead, to: '2027-01-30' }, [], today, true)).toBeNull()     // start + 90
    expect(pauseError({ ...ahead, to: '2027-01-31' }, [], today, true)).toBe(LIMIT)
  })

  it('eine neue Pause bleibt auf 90 Tage begrenzt', () => {
    expect(pauseError({ id: 'n', kind: 'pause', from: today, to: '2027-01-19' }, [], today)).toBeNull()
    expect(pauseError({ id: 'n', kind: 'pause', from: today, to: '2027-01-20' }, [], today)).toBe(LIMIT)
  })
})
