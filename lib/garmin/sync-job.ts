import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { markGarminSynced } from '@/lib/garmin/account'
import { enrichActivityDetail, enrichActivityStreams, syncGarminActivities } from '@/lib/api-clients/garmin'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import { runAndSaveEngine } from '@/lib/plan/engine-store'

const LAST_SYNC_KEY = 'garmin_last_sync'

export interface SyncResult {
  inserted: number
  updated: number
  enriched: number
  failed: number
  remaining: number
  log: string[]
}

export interface LastSync extends Omit<SyncResult, 'log'> {
  at: string
  error?: string
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// Garmin runs still missing splits or streams (cross-training rows carry no detail data, 08-01).
const missingDetail = and(
  isNotNull(activities.garminActivityId),
  inArray(activities.type, RUN_ACTIVITY_TYPES),
  or(eq(activities.hasDetailedData, false), eq(activities.hasStreams, false)),
)

async function saveLastSync(s: LastSync) {
  await Promise.all([setSettingJson(LAST_SYNC_KEY, s), markGarminSynced()])
}

export async function loadLastSync(): Promise<LastSync | null> {
  return getSettingJson<LastSync>(LAST_SYNC_KEY)
}

// List the last `days` from Garmin, then load detail data (splits, streams, metrics) for
// up to `enrichLimit` runs, newest first. 8 per call keeps one request within 60 s.
export async function runGarminSync({ days = 28, enrichLimit = 8 } = {}): Promise<SyncResult> {
  const log: string[] = []
  const r: SyncResult = { inserted: 0, updated: 0, enriched: 0, failed: 0, remaining: 0, log }

  try {
    const { inserted, updated } = await syncGarminActivities(days)
    r.inserted = inserted
    r.updated = updated
    log.push(`synced: ${inserted} new, ${updated} updated`)

    const pending = await db
      .select({
        garminActivityId: activities.garminActivityId,
        hasDetailedData: activities.hasDetailedData,
        hasStreams: activities.hasStreams,
      })
      .from(activities)
      .where(own(activities, missingDetail))
      .orderBy(desc(activities.date))
      .limit(enrichLimit)

    for (const row of pending) {
      const gid = row.garminActivityId!
      try {
        if (!row.hasDetailedData) await enrichActivityDetail(gid)
        if (!row.hasStreams) await enrichActivityStreams(gid)
        r.enriched++
        await sleep(200)
      } catch (err: any) {
        r.failed++
        log.push(`enrich failed: ${gid} (${err?.message ?? err})`)
      }
    }
    log.push(`enriched: ${r.enriched} activities`)

    const [counts] = await db.select({ n: sql<number>`count(*)::int` }).from(activities).where(own(activities, missingDetail))
    r.remaining = counts?.n ?? 0
    log.push(`remaining without detail: ${r.remaining}`)

    const { log: _, ...summary } = r
    await saveLastSync({ at: new Date().toISOString(), ...summary })

    // Adapt the plan to the new runs, after the sync time is saved (the engine only treats days
    // covered by a sync as missed). Never fails the sync.
    try {
      const engine = await runAndSaveEngine()
      log.push(`plan engine: ${engine.log.length} changes in log`)
    } catch (err: any) {
      log.push(`plan engine failed: ${err?.message ?? err}`)
    }
    return r
  } catch (err: any) {
    const { log: _, ...summary } = r
    await saveLastSync({ at: new Date().toISOString(), ...summary, error: err?.message ?? String(err) }).catch(() => {})
    throw err
  }
}
