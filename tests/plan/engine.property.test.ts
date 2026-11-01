// Property tests for the plan engine (lib/plan/engine.ts) on random days, runs, edits and form.
// Findings F-01 … F-04 (fixed in 07-11) are reproduced in findings.test.ts; no exclusions left here.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { EMPTY_ENGINE, runEngine, undoChange, type EngineInput, type EngineState } from '@/lib/plan/engine'
import { effectiveSessions } from '@/lib/plan/effective'
import { PLAN_START } from '@/examples/porto-2026/plan'
import { engineCaseArb, actualOf, plus } from './arbitraries'
import { checkInvariants, engineLogged, formatViolation } from './invariants'

const RUNS = 500
const at = (d: string) => `${d}T07:00:00.000Z`

// The engine's state on `today`: it already ran three days earlier (when that is in the plan).
function warmState(c: { today: string; runs: EngineInput['runs']; manual: EngineInput['manual']; fitness: EngineInput['fitness']; lag: number }): EngineState {
  const prev = plus(c.today, -3)
  if (prev <= PLAN_START) return EMPTY_ENGINE
  const synced = plus(prev, -c.lag)
  return runEngine({ today: prev, at: at(prev), manual: c.manual, state: EMPTY_ENGINE,
    runs: c.runs.filter((r) => r.date <= synced), fitness: c.fitness, syncedThrough: synced }).state
}

function inputOf(c: Parameters<typeof warmState>[0]): EngineInput {
  const synced = plus(c.today, -c.lag)
  return { today: c.today, at: at(c.today), manual: c.manual, state: warmState(c),
    runs: c.runs.filter((r) => r.date <= synced), fitness: c.fitness, syncedThrough: synced }
}

// Past days a step may rewrite: by design (O-01) a moved key session leaves "verschoben auf …" on its past day.
const movedFrom = (added: ReturnType<typeof runEngine>['added'], today: string) => added
  .filter((x) => x.rule === 'missed-key' && x.status === 'active')
  .flatMap((x) => Object.entries(x.after).filter(([d, s]) => d < today && s.type === 'rest').map(([d]) => d))

describe('Plan-Engine: Regeln gelten immer', () => {
  it('verletzt keine Invariante', () => {
    fc.assert(fc.property(engineCaseArb, (c) => {
      const input = inputOf(c)
      const { state, added } = runEngine(input)
      const v = checkInvariants({
        writer: 'engine', today: c.today, manual: c.manual,
        before: effectiveSessions(c.manual, input.state.overrides),
        after: effectiveSessions(c.manual, state.overrides),
        writes: added.filter((x) => x.status === 'active').flatMap((x) => Object.keys(x.after)),
        logged: engineLogged(added, state.log),
        ran: new Set(actualOf(input.runs).keys()),
        allowPast: movedFrom(added, c.today),
      })
      expect(v.map(formatViolation)).toEqual([])
    }), { numRuns: RUNS })
  })

  it('ist idempotent: zweiter Lauf am selben Tag ändert nichts', () => {
    fc.assert(fc.property(engineCaseArb, (c) => {
      const input = inputOf(c)
      const first = runEngine(input).state
      const second = runEngine({ ...input, state: first, at: `${c.today}T19:00:00.000Z` })
      expect(second.added.map((x) => `${x.rule}:${x.key}:${x.status}`)).toEqual([])
      expect(second.state.overrides).toEqual(first.overrides)
    }), { numRuns: RUNS })
  })

  it('ist deterministisch', () => {
    fc.assert(fc.property(engineCaseArb, (c) => {
      const input = inputOf(c)
      expect(runEngine(input)).toEqual(runEngine(input))
    }), { numRuns: RUNS })
  })

  it('Rückgängig stellt die Tage exakt wieder her und die Regel macht es nicht erneut', () => {
    fc.assert(fc.property(engineCaseArb, (c) => {
      const input = inputOf(c)
      const { state } = runEngine(input)
      const last = [...state.log].reverse().find((x) => x.status === 'active')
      if (!last) return
      const undone = undoChange(state, last.id)
      if ('error' in undone) throw new Error(undone.error)
      for (const [d, prev] of Object.entries(last.before)) expect(undone.overrides[d] ?? null).toEqual(prev)
      for (const d of Object.keys(state.overrides).filter((d) => !(d in last.after))) expect(undone.overrides[d]).toEqual(state.overrides[d])
      const again = runEngine({ ...input, state: undone, at: `${c.today}T20:00:00.000Z` })
      const vetoed = last.vetoKey ?? last.key
      expect(again.added.filter((x) => x.status === 'active' && (x.key === last.key || x.vetoKey === vetoed)).map((x) => x.key)).toEqual([])
    }), { numRuns: RUNS })
  })

  it('nur synchronisierte Tage zählen: Läufe nach syncedThrough ändern nichts', () => {
    fc.assert(fc.property(engineCaseArb, (c) => {
      const input = inputOf(c)
      // The same morning, but runs after the synced day are already known (e.g. uploaded, not yet synced in full).
      const withLate = { ...input, runs: c.runs.filter((r) => r.date < c.today) }
      const a = runEngine(input), b = runEngine(withLate)
      // Allowed difference: a later run may prove a session done. Not allowed: a change caused by an unsynced day.
      const caused = (x: { key: string }) => {
        const d = x.key.match(/\d{4}-\d{2}-\d{2}/)?.[0]
        return d && d > input.syncedThrough! && d < c.today
      }
      expect(a.added.filter(caused).map((x) => x.key)).toEqual([])
      expect(b.added.filter((x) => x.status === 'active' && x.rule === 'missed-key' && caused(x)).map((x) => x.key)).toEqual([])
    }), { numRuns: RUNS })
  })
})
