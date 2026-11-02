// AC-3 (Phase 4): without Plus the engine's new plan changes become suggestions. The engine is unchanged; the store
// saves its result minus the suggestions, and taking all of them over gives exactly what Plus would have saved.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { EMPTY_ENGINE, runEngine, type EngineInput, type EngineState } from '@/lib/plan/engine'
import { applySuggestion, withoutSuggestions } from '@/lib/plan/engine-store'
import { PLAN_START } from '@/examples/porto-2026/plan'
import { engineCaseArb, plus } from '../plan/arbitraries'

const at = (d: string) => `${d}T07:00:00.000Z`

function inputOf(c: { today: string; runs: EngineInput['runs']; manual: EngineInput['manual']; fitness: EngineInput['fitness']; lag: number }): EngineInput {
  const prev = plus(c.today, -3)
  const synced = plus(c.today, -c.lag)
  const state: EngineState = prev <= PLAN_START ? EMPTY_ENGINE
    : runEngine({ today: prev, at: at(prev), manual: c.manual, state: EMPTY_ENGINE, runs: c.runs.filter((r) => r.date <= plus(prev, -c.lag)), fitness: c.fitness, syncedThrough: plus(prev, -c.lag) }).state
  return { today: c.today, at: at(c.today), manual: c.manual, state, runs: c.runs.filter((r) => r.date <= synced), fitness: c.fitness, syncedThrough: synced }
}

describe('Engine-Vorschläge ohne Plus', () => {
  it('ohne Korrekturen bleibt der gespeicherte Plan unverändert; alle Vorschläge übernehmen = Plus-Ergebnis', () => {
    let withSuggestions = 0
    fc.assert(fc.property(engineCaseArb, (c) => {
      const input = inputOf(c)
      const r = runEngine(input)
      const { state, suggestions } = withoutSuggestions(r.state, r.added)
      if (suggestions.length) withSuggestions++
      for (const s of suggestions) expect(s.status).toBe('active')
      if (!r.added.some((x) => x.key.startsWith('rebalance-fix:'))) {
        expect(state.overrides).toEqual(input.state.overrides)
      }
      const accepted = suggestions.reduce((s, x) => applySuggestion(s, x), state)
      expect(accepted.overrides).toEqual(r.state.overrides)
      expect(accepted.log.map((x) => x.id)).toEqual(expect.arrayContaining(r.state.log.map((x) => x.id)))
    }), { numRuns: 300 })
    expect(withSuggestions).toBeGreaterThan(10)        // the property was actually exercised
  })

  it('ein einzelner Vorschlag übernimmt genau seine Tage, mit dem gespeicherten Stand als „vorher“', () => {
    fc.assert(fc.property(engineCaseArb, (c) => {
      const input = inputOf(c)
      const r = runEngine(input)
      const { state, suggestions } = withoutSuggestions(r.state, r.added)
      for (const s of suggestions) {
        const next = applySuggestion(state, s)
        const changed = Object.keys(next.overrides).filter((d) => JSON.stringify(next.overrides[d]) !== JSON.stringify(state.overrides[d]))
        for (const d of changed) expect(Object.keys(s.after)).toContain(d)
        const logged = next.log[next.log.length - 1]
        for (const d of Object.keys(s.after)) expect(logged.before[d]).toEqual(state.overrides[d] ?? null)
      }
    }), { numRuns: 150 })
  })

  it('ablehnen setzt ein Veto, der Plan bleibt', () => {
    const c = { key: 'fatigue:2026-10-01', vetoKey: undefined, id: 'x', at: at('2026-10-01'), rule: 'fatigue' as const, reason: '', before: {}, after: { '2026-10-01': { date: '2026-10-01', type: 'easy' as const, km: 8, title: 'Locker' } }, status: 'active' as const }
    const next = applySuggestion(EMPTY_ENGINE, c, true)
    expect(next.vetoes).toEqual(['fatigue:2026-10-01'])
    expect(next.overrides).toEqual({})
  })
})
