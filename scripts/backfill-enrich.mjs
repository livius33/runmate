import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#'))
    .map(l => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()])
)
for (const [k, v] of Object.entries(env)) process.env[k] = v

const { enrichActivityDetail, enrichActivityStreams } = await import('../lib/api-clients/garmin.ts')
const { db } = await import('../lib/db/index.ts')
const { activities } = await import('../lib/db/schema.ts')
const { and, isNotNull, or, eq } = await import('drizzle-orm')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const pending = await db
  .select({ id: activities.id, garminActivityId: activities.garminActivityId, date: activities.date })
  .from(activities)
  .where(
    and(
      isNotNull(activities.garminActivityId),
      or(eq(activities.hasDetailedData, false), eq(activities.hasStreams, false)),
    ),
  )
  .orderBy(activities.date)

console.log(`${pending.length} activities to backfill`)

let ok = 0
let failed = 0

for (const [i, row] of pending.entries()) {
  const gid = row.garminActivityId
  try {
    const [a] = await db
      .select({ hasDetailedData: activities.hasDetailedData, hasStreams: activities.hasStreams })
      .from(activities)
      .where(eq(activities.id, row.id))
      .limit(1)
    if (!a.hasDetailedData) await enrichActivityDetail(gid)
    await sleep(350)
    if (!a.hasStreams) await enrichActivityStreams(gid)
    await sleep(350)
    ok++
  } catch (err) {
    failed++
    console.error(`  [${i + 1}/${pending.length}] FAILED ${row.date} (${gid}):`, err.message ?? err)
  }
  if ((i + 1) % 20 === 0) console.log(`  progress: ${i + 1}/${pending.length} (ok=${ok}, failed=${failed})`)
}

console.log(`Done. ok=${ok} failed=${failed}`)
