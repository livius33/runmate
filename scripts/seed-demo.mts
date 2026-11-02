// Seeds the demo athlete (Phase 5): deletes every row of the demo user and writes freshly generated data for today
// (lib/demo/generate.ts). Touches no other user. The nightly reset does the same (/api/cron/demo-reset).
//   npx tsx --env-file=.env.local scripts/seed-demo.mts            write to the database
//   npx tsx scripts/seed-demo.mts --dry [--today 2026-11-02]        generate only, print counts (no database)
import { setProcessScope } from '../lib/scope'
import { todayLocal } from '../lib/dates'
import { DEMO_PROFILE, DEMO_USER_ID } from '../lib/demo/athlete'
import { generateDemo } from '../lib/demo/generate'
import { writeDemo } from '../lib/demo/store'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const at = args.indexOf('--today')
setProcessScope(DEMO_USER_ID, DEMO_PROFILE)
const today = at >= 0 ? args[at + 1] : todayLocal()
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('--today YYYY-MM-DD')

const data = generateDemo(today)
const engine = data.settings.plan_engine as { log: { rule: string; status: string; reason: string }[] }
console.log(`Demo für ${today}: Block ${data.block.planStart} – ${data.block.end}, Rennen ${data.block.race.date}`)
console.log(`${data.activities.length} Aktivitäten, ${data.streams.length} mit Streams; Engine: ${engine.log.map((c) => c.rule).join(', ')}`)
if (dry) process.exit(0)
console.log(await writeDemo(data))
