// An open Krank/Pause period that began more than MAX_BACKDATE_DAYS ago must still take its end ("Wieder fit ab"):
// the backdate limit is for entering a new period, not for ending one that is already stored.
import { describe, expect, it } from 'vitest'
import { MAX_BACKDATE_DAYS, pauseError, type Pause } from '@/lib/plan/pause'

describe('Pause beenden', () => {
  const today = '2026-10-21'
  const open: Pause = { id: 'p', kind: 'krank', from: '2026-09-28', to: null }   // 23 days ago, still open

  it('eine lange offene Pause lässt sich beenden', () => {
    expect(pauseError({ ...open, to: '2026-10-20' }, [], today, true)).toBeNull()
  })

  it('das Ende wird weiter geprüft', () => {
    expect(pauseError({ ...open, to: '2026-09-27' }, [], today, true)).toBe('Das Ende liegt vor dem Start.')
  })

  it('eine neue Pause bleibt begrenzt', () => {
    expect(pauseError({ ...open, to: '2026-10-20' }, [], today)).toBe(`Höchstens ${MAX_BACKDATE_DAYS} Tage rückwirkend.`)
  })
})
