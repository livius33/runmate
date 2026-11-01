// Snapshot of all plan outputs, day by day (06-03: proves a refactor changes nothing). No database: inputs come from the
// simulator (tests/plan/simulate.ts, over examples/porto-2026) — several scenarios and seeds, each with its own runs, edits and engine state.
//   npx tsx scripts/snapshot-plan.mts > before.json   …refactor…   npx tsx scripts/snapshot-plan.mts > after.json; diff
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseISO } from 'date-fns'
import { SCENARIOS, simulate } from '../tests/plan/simulate'
import { plus, actualOf, easyPaceS } from '../tests/plan/arbitraries'
import { effectiveSessions, moveModes, weekSummary, maxKm } from '../lib/plan/effective'
import { runEngine } from '../lib/plan/engine'
import { registerBuiltInBlocks, weekOf } from '../lib/plan/blocks'
import { PORTO_2026 } from '../examples/porto-2026/plan'
import { todayInsight } from '../lib/insights/today'
import { racePrediction } from '../lib/insights/prediction'
import { raceReadiness } from '../lib/insights/readiness'
import { recoveryStatus } from '../lib/insights/recovery'
import { weekReview } from '../lib/insights/week'
import { decidePlan } from '../lib/plan/race-day'
import { fitnessSeries } from '../lib/analytics/load'
import { PlanHeader } from '../components/plan/PlanHeader'

registerBuiltInBlocks([PORTO_2026]);   // the simulator runs over the example block

// Components are compiled with the classic JSX runtime outside Next.js.
(globalThis as { React?: typeof React }).React = React

const UNTIL = '2026-12-06'
const CASES: [string, number][] = [['reliable', 1], ['reliable', 2], ['skip20', 3], ['sick-build', 4], ['fast', 5], ['late-sync', 6], ['holiday', 7]]

// Stable JSON: sorted keys, Maps as sorted entries.
const stable = (v: unknown): unknown => {
  if (v instanceof Map) return [...v.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([k, x]) => [k, stable(x)])
  if (Array.isArray(v)) return v.map(stable)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
  return v
}

const out: Record<string, unknown[]> = {}
for (const [name, seed] of CASES) {
  const sc = SCENARIOS.find((s) => s.name === name)!
  const days: unknown[] = []
  const res = simulate(sc, seed, {
    until: UNTIL,
    onDay: ({ date: d, manual, state, runs, synced, fitness }) => {
      const sessions = effectiveSessions(manual, state.overrides)
      const actual = actualOf(runs)
      const rows = runs.map((r) => ({ date: r.date, durationS: Math.round(r.km * (r.paceS ?? easyPaceS)), averageHr: r.avgHr, sufferScore: null }))
      const series = fitnessSeries(rows as never, parseISO(d))
      const week = weekOf(d)
      const prediction = racePrediction({ today: d, sessions, runs })
      const engine = runEngine({ today: d, at: `${d}T12:00:00.000Z`, manual, state, runs, fitness, syncedThrough: synced })
      days.push({
        d,
        sessions: sessions.filter((s) => s.date >= plus(d, -7) && s.date <= plus(d, 14)),
        maxKm: sessions.filter((s) => s.date >= d && s.date <= plus(d, 7)).map((s) => [s.date, maxKm(s.date)]),
        week: week && { summary: weekSummary(week, d, sessions, actual), review: weekReview({ week, today: d, sessions, runs, fitness: series, engineLog: state.log }) },
        engine: { overrides: engine.state.overrides, added: engine.added.map((c) => [c.rule, c.key, c.status, c.reason]) },
        today: todayInsight({ today: d, sessions, manual, engineLog: state.log, runs, tsb: fitness.tsb, acwr: fitness.acwr }),
        prediction,
        readiness: raceReadiness({ today: d, sessions, runs, prediction, fitness: series, acwr: fitness.acwr }),
        recovery: recoveryStatus({ today: d, sessions, runs, fitness: series }),
        decision: decidePlan({ today: d, engineLog: state.log, sessions, runs }),
        moves: [[d, plus(d, 1)], [d, plus(d, 2)], [plus(d, 1), plus(d, 3)], [plus(d, -1), plus(d, 1)]].map(([a, b]) => [a, b, moveModes(a, b, d, sessions, actual)]),
        header: renderToStaticMarkup(createElement(PlanHeader, { today: d })),
      })
    },
  })
  if (res.errors.length) { console.error(name, seed, res.errors.slice(0, 3)); process.exit(1) }
  out[`${name}#${seed}`] = days
}
process.stdout.write(JSON.stringify(stable(out), null, 1))
