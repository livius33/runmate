// Simulated athletes (tests/plan/simulate.ts): 10 scenarios × 50 seasons over the Porto plan.
// Hard failures (invariant violations, exceptions) must be 0; known findings are counted, not failed.
// Soft signals are printed once; replay a season with: npx tsx scripts/simulate-plan.mts --scenario <name> --seed <n> --verbose
import { describe, expect, it } from 'vitest'
import { SCENARIOS, simulate, summarize } from './simulate'

const SEEDS = 50
const rows: Record<string, unknown>[] = []

describe('Simulierte Athleten', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.label}: keine harten Fehler in ${SEEDS} Saisons`, () => {
      const results = Array.from({ length: SEEDS }, (_, i) => simulate(sc, i + 1))
      const s = summarize(results)
      rows.push({
        Szenario: sc.name, 'Plan-km': s.stats.finalPlanKm.mean, gelaufen: s.stats.runKm.mean,
        'max Woche': s.stats.maxWeekKm.max, 'Engine/Woche': s.stats.changesPerWeek.mean,
        'Hin-und-her': s.stats.flipFlopDays.max, 'rote Tage': s.stats.redDays.mean,
        bekannt: Object.entries(s.known).map(([k, n]) => `${k}×${n}`).join(' '),
      })
      const first = results.find((r) => r.violations.length || r.errors.length)
      expect(first ? { seed: first.seed, errors: first.errors.slice(0, 3), violations: first.violations.slice(0, 5) } : null).toBeNull()
    })
  }

  it('Weiche Signale (Tabelle)', () => {
    console.table(rows)
    expect(rows.length).toBe(SCENARIOS.length)
  })
})
