// Checks the methodology templates (07-01). No database.
//   npx tsx scripts/check-methodologies.mts            all templates valid? Example template vs. the example plan
//   npx tsx scripts/check-methodologies.mts --fixture  also show the errors of the deliberately broken test file
// The example (examples/porto-2026) holds only the final eleven weeks of its build, so the comparison is a report;
// only invalid templates fail the check.
import { readFileSync } from 'node:fs'
import { RACE, SESSIONS } from '../examples/porto-2026/plan'
import { portoTemplate } from '../examples/porto-2026/template'
import { listMethodologies, listOwnBases, parseMethodology } from '../lib/plan/methodology/load'
import { describePlan, type PlanLike } from '../lib/plan/methodology/describe'
import { compareToTemplate, explainedKeys } from '../lib/plan/methodology/compare'

let failed = false
const { valid, invalid } = listMethodologies()
console.log(`Vorlagen: ${valid.map((m) => m.id).join(', ') || '–'}`)
for (const f of invalid) {
  failed = true
  console.log(`✗ ${f.file}`)
  for (const e of f.errors) console.log(`    ${e}`)
}

// Neutral bases of the own method (07-19), methodologies/own/.
const own = listOwnBases()
console.log(`Eigene Methode, Grundlagen: ${own.valid.map((m) => m.id).join(', ') || '–'}`)
for (const f of own.invalid) {
  failed = true
  console.log(`✗ own/${f.file}`)
  for (const e of f.errors) console.log(`    ${e}`)
}

if (process.argv.includes('--fixture')) {
  const r = parseMethodology(readFileSync('scripts/fixtures/methodology-broken.md', 'utf8'))
  console.log('\nTestdatei scripts/fixtures/methodology-broken.md:')
  for (const e of r.ok ? ['(unerwartet gültig)'] : r.errors) console.log(`    ${e}`)
}

let porto
try { porto = portoTemplate() } catch (e) {
  console.log(`\n✗ ${(e as Error).message}`)
  process.exit(1)
}
const plan: PlanLike[] = SESSIONS
const measured = describePlan(plan, { raceDate: RACE.date, racePaceS: RACE.goalPaceS })
const explained = new Set(explainedKeys(porto.bodyMarkdown))
const rows = compareToTemplate(porto.params, measured, 'marathon')

console.log(`\nBeispiel-Vorlage vs. Beispielplan (${measured.weeks.length} Wochen, Spitze ${measured.peakKm} km; nur Bericht)`)
const f = (n: number | null) => (n == null ? '–' : String(n).replace('.', ','))
for (const r of rows) {
  const mark = r.ok ? 'ok ' : explained.has(r.key) ? 'erk' : 'AUS'
  console.log(`  ${mark} ${r.key.padEnd(30)} Vorlage ${f(r.template).padStart(5)}  gemessen ${f(r.measured).padStart(5)}  Δ ${f(r.diff).padStart(6)}  (±${f(Math.round(r.tolerance * 100) / 100)})`)
}
console.log(`\nWochentage (gemessen): ${Object.entries(measured.weekdays).map(([d, t]) => `${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][Number(d) - 1]} ${t}`).join(' · ')}`)
console.log(failed ? '\n✗ ungültige Vorlagen' : '\n✓ alle Vorlagen gültig')
process.exit(failed ? 1 : 0)
