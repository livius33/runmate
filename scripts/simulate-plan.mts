// Simulated seasons over the example plan (examples/porto-2026; 07-00 test harness). No database, no network.
//   npx tsx scripts/simulate-plan.mts --seeds 50                    all scenarios, 50 seasons each
//   npx tsx scripts/simulate-plan.mts --scenario fast --seeds 200
//   npx tsx scripts/simulate-plan.mts --scenario skip20 --seed 7 --verbose   one season, day by day
//   … --json out.json                                               raw results for a review page
import { writeFileSync } from 'node:fs'
import { registerBuiltInBlocks } from '../lib/plan/blocks'
import { PORTO_2026 } from '../examples/porto-2026/plan'
import { SCENARIOS, simulate, summarize, type SimResult } from '../tests/plan/simulate'

registerBuiltInBlocks([PORTO_2026])

const args = process.argv.slice(2)
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const flag = (name: string) => args.includes(`--${name}`)

const only = opt('scenario')
const scenarios = SCENARIOS.filter((s) => !only || s.name === only)
if (!scenarios.length) {
  console.error(`Unbekanntes Szenario "${only}". Vorhanden: ${SCENARIOS.map((s) => s.name).join(', ')}`)
  process.exit(2)
}
const one = opt('seed')
const seeds = one ? [Number(one)] : Array.from({ length: Number(opt('seeds') ?? 50) }, (_, i) => i + 1)
const verbose = flag('verbose')

const all: SimResult[] = []
let failed = 0
for (const sc of scenarios) {
  const results = seeds.map((seed) => simulate(sc, seed, { verbose }))
  all.push(...results)
  const s = summarize(results)
  failed += s.hardFailures
  console.log(`\n■ ${sc.label} (${sc.name}) — ${s.seasons} Saisons`)
  console.log(`  harte Fehler: ${s.hardFailures}${s.failingSeeds.length ? ` · Seeds ${s.failingSeeds.slice(0, 10).join(', ')}` : ''}`)
  if (Object.keys(s.known).length) console.log(`  bekannte Befunde: ${Object.entries(s.known).map(([k, n]) => `${k} ×${n}`).join(', ')}`)
  const m = s.stats
  console.log(`  Plan-km ${m.finalPlanKm.mean} (Basis ${m.basePlanKm.mean}) · gelaufen ${m.runKm.mean} · größte Woche ${m.maxWeekKm.mean} / max ${m.maxWeekKm.max} (Basis ${m.baseMaxWeekKm.mean})`)
  console.log(`  Engine-Änderungen ${m.engineChanges.mean} (${m.changesPerWeek.mean}/Woche, max ${m.engineChanges.max}) · Hin-und-her-Tage ${m.flipFlopDays.mean} / max ${m.flipFlopDays.max}`)
  console.log(`  verpasst ${m.missedKm.mean} km · ausgeglichen ${m.rebalancedKm.mean} km · Werkstatt übernommen ${m.workshopApplied.mean} · rote Tage ${m.redDays.mean}`)
  for (const r of results.filter((x) => x.violations.length || x.errors.length).slice(0, 3)) {
    console.log(`  ✗ Seed ${r.seed}:`)
    for (const e of r.errors.slice(0, 3)) console.log(`      ${e.date} Fehler: ${e.message}`)
    for (const v of r.violations.slice(0, 5)) console.log(`      ${v.date} ${v.step}: ${v.text}`)
  }
  if (verbose) {
    for (const r of results) {
      console.log(`\n  Saison Seed ${r.seed}`)
      for (const d of r.log) {
        const lines = [...d.engine.map((e) => `Engine ${e}`), d.workshop && `Werkstatt: ${d.workshop}`, d.run && `Lauf: ${d.run}`].filter(Boolean)
        console.log(`  ${d.date} (Sync bis ${d.synced}, TSB ${d.fitness.tsb ?? '–'}, ACWR ${d.fitness.acwr ?? '–'})${lines.length ? '' : ' –'}`)
        for (const l of lines) console.log(`      ${l}`)
      }
    }
  }
}

const json = opt('json')
if (json) {
  writeFileSync(json, JSON.stringify(all.map(({ log, ...r }) => (verbose ? { ...r, log } : r)), null, 1))
  console.log(`\nJSON: ${json}`)
}
process.exit(failed ? 1 : 0)
