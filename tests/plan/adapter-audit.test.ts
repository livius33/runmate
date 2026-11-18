// Findings of the plan-adapter audit before launch (phase 08): each one reproduced with fixed inputs on the example
// block, then fixed. The rules they pin come from methodologies/research/adaptation.md.
import { describe, expect, it } from 'vitest'
import { EMPTY_ENGINE, runEngine } from '@/lib/plan/engine'
import { effectiveSessions } from '@/lib/plan/effective'
import { allSessions } from '@/lib/plan/blocks'
import { makeRun } from './arbitraries'

const FRESH = { tsb: 0, acwr: 1 }
const kmOf = (sessions: { date: string; km?: number }[], d: string) => sessions.find((s) => s.date === d)?.km ?? 0

describe('Audit Plan-Engine', () => {
  // A-01: the fatigue guard turns Tuesday's 18 km tempo run into 12.5 km easy. The next morning the red zone is over
  // and Monday's 20 km are missing: rebalance saw "an easy day" and filled it up to the cap of the original hard
  // session (23 km) — +10.5 km on the very day the guard had just reduced, twice the +5 km a day may gain.
  it('A-01 der Ausgleich füllt keinen Tag auf, den der Ermüdungsschutz gerade gekürzt hat', () => {
    const mon = runEngine({ today: '2026-09-28', at: 'A', manual: {}, state: EMPTY_ENGINE, runs: [], fitness: { tsb: -30, acwr: 0.9 }, syncedThrough: '2026-09-27' })
    const softened = effectiveSessions({}, mon.state.overrides)
    expect(softened.find((s) => s.date === '2026-09-29')).toMatchObject({ type: 'easy', km: 12.5 })

    const tue = runEngine({ today: '2026-09-29', at: 'B', manual: {}, state: mon.state, runs: [], fitness: { tsb: -17, acwr: 0.9 }, syncedThrough: '2026-09-28' })
    const after = effectiveSessions({}, tue.state.overrides)
    expect(tue.added.some((c) => c.rule === 'rebalance' && c.status === 'active')).toBe(true)   // the missed km are still spread
    expect(kmOf(after, '2026-09-29')).toBe(12.5)
    for (const s of allSessions().filter((x) => x.date >= '2026-09-28' && x.date <= '2026-10-04')) {
      expect(kmOf(after, s.date) - kmOf(softened, s.date), s.date).toBeLessThanOrEqual(5)
    }
  })

  // A-02: the self-correction compared all additions of the week (also those on days already past) with a gap
  // counted without them, while the rule counts the gap with them. Monday 6 km short → Tuesday: +3 km Wed, +3 km Thu.
  // Wednesday 2 km short → Thursday: +1.5 km Thu. The next engine run the same day took that back ("Lauf
  // nachträglich synchronisiert", no run was synced), and the day after the rule added it again.
  it('A-02 ein zweiter Ausgleich in derselben Woche übersteht den nächsten Engine-Lauf', () => {
    const mon = makeRun('2026-10-05', 7, 340, 130, 1), tue = makeRun('2026-10-06', 17, 255, 160, 2), wed = makeRun('2026-10-07', 15, 340, 130, 3)
    const first = runEngine({ today: '2026-10-06', at: 'A', manual: {}, state: EMPTY_ENGINE, runs: [mon], fitness: FRESH, syncedThrough: '2026-10-05' })
    expect(first.added.filter((c) => c.rule === 'rebalance').map((c) => [c.addedKm, Object.keys(c.after)])).toEqual([[6, ['2026-10-07', '2026-10-08']]])

    const input = { today: '2026-10-08', manual: {}, runs: [mon, tue, wed], fitness: FRESH, syncedThrough: '2026-10-07' }
    const second = runEngine({ ...input, at: 'B', state: first.state })
    expect(second.added.filter((c) => c.rule === 'rebalance' && c.status === 'active').map((c) => Object.keys(c.after))).toEqual([['2026-10-08']])

    const again = runEngine({ ...input, at: 'C', state: second.state })
    expect(again.added.map((c) => c.reason)).toEqual([])
    expect(again.state.overrides).toEqual(second.state.overrides)
  })
})
