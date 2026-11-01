// Krank/Pause and the engine (07-08 AC-5, closes S-01): with the off days marked as Krank, the engine never moves or
// redistributes into or out of the pause and its two return weeks, and no day there ends above the base plan.
import { describe, expect, it } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { PAUSE_SCENARIOS, simulate } from './simulate'
import { SESSIONS } from '@/examples/porto-2026/plan'
import { effectiveSessions } from '@/lib/plan/effective'
import type { DayState } from './simulate'

const SEEDS = 20
const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const planKm = (s?: { type: string; km?: number }) => (s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)

describe('Krank markiert: Engine hält sich raus (AC-5)', () => {
  for (const sc of PAUSE_SCENARIOS) {
    it(`${sc.label}: keine harten Fehler, nichts nachgeholt, kein Tag über dem Plan`, () => {
      const [from, to] = sc.off![0]
      const until = day(to, 15)
      for (let seed = 1; seed <= SEEDS; seed++) {
        let last: DayState | null = null
        const r = simulate(sc, seed, { onDay: (s) => { last = s } })
        expect(r.errors.slice(0, 3), `seed ${seed}`).toEqual([])
        expect(r.violations.slice(0, 5), `seed ${seed}`).toEqual([])
        const touched = last!.state.log.filter((c) => c.status === 'active' && (c.rule === 'rebalance' || c.rule === 'missed-key'))
          .flatMap((c) => Object.keys(c.after)).filter((d) => d >= from && d <= until)
        expect(touched, `seed ${seed}`).toEqual([])
        const pause = { pauses: [{ id: 'p', kind: 'krank' as const, from, to }], today: last!.date }
        const eff = effectiveSessions(last!.manual, last!.state.overrides, pause)
        for (const b of SESSIONS.filter((x) => x.date >= from && x.date <= until)) {
          expect(planKm(eff.find((x) => x.date === b.date)), `seed ${seed} ${b.date}`).toBeLessThanOrEqual(planKm(b))
        }
      }
    })
  }

  it('Vergleich: mit Markierung weniger Plan-km als ohne (alte Lage S-01)', () => {
    const [sc] = PAUSE_SCENARIOS
    expect(simulate(sc, 1).metrics.finalPlanKm).toBeLessThan(simulate({ ...sc, markPause: false }, 1).metrics.finalPlanKm)
  })
})
