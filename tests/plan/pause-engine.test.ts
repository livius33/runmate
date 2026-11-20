// Krank/Pause and the engine (07-08 AC-5, closes S-01): with the off days marked as Krank, the engine never moves or
// redistributes into or out of the pause and its two return weeks, and no day there ends above the base plan.
import { describe, expect, it } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { PAUSE_SCENARIOS, simulate } from './simulate'
import { SESSIONS } from '@/examples/porto-2026/plan'
import { effectiveSessions } from '@/lib/plan/effective'
import type { DayState, Scenario } from './simulate'

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

// 08-02: the return caps share one budget per week. When the engine lowered a day in a return week (fatigue guard),
// the cap handed the freed km to the longest other day, past and run days included, and no log entry said so.
describe('Rückkehrwochen: was die Engine kürzt, wandert nicht auf einen anderen Tag (08-02)', () => {
  const kmOn = (list: { date: string; km?: number }[], d: string) => list.find((s) => s.date === d)?.km

  it('21 Tage krank: der Ermüdungsschutz am So. 1.11. ändert nur diesen Tag', () => {
    const pause = { pauses: [{ id: 'p', kind: 'krank' as const, from: '2026-09-28', to: '2026-10-18' }], today: '2026-10-30' }
    const before = effectiveSessions({}, {}, pause)
    expect([kmOn(before, '2026-10-31'), kmOn(before, '2026-11-01')]).toEqual([13, 10])
    // What the fatigue guard writes: the capped session at 70 %, as an easy run.
    const after = effectiveSessions({}, { '2026-11-01': { date: '2026-11-01', type: 'easy', km: 7, title: 'Locker statt Schwelle statt Renntempo' } }, pause)
    expect(after.filter((s, i) => JSON.stringify(s) !== JSON.stringify(before[i])).map((s) => s.date)).toEqual(['2026-11-01'])
    expect([kmOn(after, '2026-10-31'), kmOn(after, '2026-11-01')]).toEqual([13, 7])
  })

  const SICK: Scenario[] = [
    { name: 'sick-21-marked', label: '21 Tage krank, als Krank markiert', off: [['2026-09-28', '2026-10-18']], markPause: true },
    { name: 'sick-fast-marked', label: 'Eine Woche krank, danach zu schnell (rote Form)', off: [['2026-09-29', '2026-10-05']], markPause: true, paceDelta: -15, hrDelta: 12, tsbBias: -18 },
  ]
  for (const sc of SICK) {
    it(`${sc.label}: jede Änderung steht im Log, kein gelaufener Tag wird umgeschrieben`, () => {
      const r = simulate(sc, 1)
      expect(r.errors.slice(0, 3)).toEqual([])
      expect(r.violations.slice(0, 5)).toEqual([])
    })
  }
})
