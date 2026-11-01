// Re-import detail streams from each run's source (lib/sources/; files keep what was imported) and (re)compute
// metrics_json.
//
//   npx tsx --env-file=.env.local scripts/backfill-run-metrics.mts            # source streams + metrics, all runs
//   npx tsx --env-file=.env.local scripts/backfill-run-metrics.mts --metrics  # recompute from stored streams only
//   ... --since 2026-08-01   only runs on/after that date
//   ... --limit 20           at most N runs (per user)
//   ... --user <clerk id>    only this user (default: every user with activities)
//
// Each user runs in their own scope (their profile, plan and source accounts; Phase 2). Garmin streams need the user's
// Garmin login (Einstellungen → Datenquellen) and ENCRYPTION_KEY.
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { desc, gte, inArray } from 'drizzle-orm'
import { own } from '@/lib/db/owned'
import { source } from '@/lib/sources/registry'
import { enrichActivity } from '@/lib/sources/sync'
import { storeRunMetrics } from '@/lib/analytics/store-metrics'
import { loadPlan } from '@/lib/plan/load'
import { runAsUser } from '@/lib/server/scope'

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }
const metricsOnly = process.argv.includes('--metrics')
const since = arg('--since') ?? '0000-00-00'
const limit = Number(arg('--limit') ?? Infinity)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const types: Record<string, number> = {}
const failed: string[] = []
const started = Date.now()

async function backfill(user: string) {
const plan = await loadPlan()
const runs = (await db
  .select({ id: activities.id, date: activities.date, source: activities.source, sourceActivityId: activities.sourceActivityId })
  .from(activities)
  .where(own(activities, inArray(activities.type, ['Run', 'TrailRun', 'VirtualRun']), gte(activities.date, since)))
  .orderBy(desc(activities.date))).slice(0, limit)

console.log(`${user}: ${runs.length} runs · ${metricsOnly ? 'metrics only' : 'source streams + metrics'}`)

for (const [n, r] of runs.entries()) {
  try {
    const src = source(r.source)
    if (metricsOnly || !r.sourceActivityId || !src?.getActivityDetail) {
      const m = await storeRunMetrics(r.id, plan)
      if (m) types[m.runType] = (types[m.runType] ?? 0) + 1
    } else {
      for (let attempt = 1; ; attempt++) {
        try { await enrichActivity(src, r.id, r.sourceActivityId, plan); break }
        catch (e: any) {
          // Rate limit: wait and retry once.
          if (attempt === 1 && e?.code === 'rate-limited') { console.log('  rate limited, waiting 60 s'); await sleep(60_000); continue }
          throw e
        }
      }
      await sleep(400)
    }
  } catch (e: any) {
    failed.push(`${r.date} ${r.source}:${r.sourceActivityId}: ${e?.code ?? String(e?.message ?? e).slice(0, 120)}`)
  }
  if ((n + 1) % 25 === 0 || n === runs.length - 1) {
    console.log(`  ${n + 1}/${runs.length} · ${Math.round((Date.now() - started) / 1000)} s · ${failed.length} failed`)
  }
}

if (!metricsOnly) {
  const rows = await db.select({ m: activities.metricsJson }).from(activities).where(own(activities, inArray(activities.id, runs.map((r) => r.id))))
  for (const row of rows) { const t = row.m ? JSON.parse(row.m).runType : 'none'; types[t] = (types[t] ?? 0) + 1 }
}
}

const only = arg('--user')
// cross-user: a maintenance script lists the users, then works on each in their own scope
const users = only ? [only] : (await db.selectDistinct({ userId: activities.userId }).from(activities)).map((r) => r.userId)
for (const user of users) await runAsUser(user, () => backfill(user))
console.log('run types:', types)
if (failed.length) console.log('failed:\n  ' + failed.join('\n  '))
process.exit(failed.length ? 1 : 0)
