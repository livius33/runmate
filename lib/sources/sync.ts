// Syncing pull sources (today: the Garmin login): the last days, one page of history, and detail data for runs that
// still lack it. Works on any ActivitySource; the plan engine runs once after a sync.
import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import { runAndSaveEngine } from '@/lib/plan/engine-store'
import type { PlanSession } from '@/lib/plan/types'
import { storeDetail, upsertSummary } from './ingest'
import { connectedPullSources } from './registry'
import { SourceError, type ActivitySource, type LastSync, type SourceErrorCode, type SourceId, type SyncResult } from './types'

export type { LastSync, SyncResult } from './types'

const lastSyncKey = (id: SourceId) => `last_sync:${id}`


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const empty = (): SyncResult => ({ inserted: 0, updated: 0, duplicates: 0, enriched: 0, failed: 0, remaining: 0, log: [] })

// Runs of this source still missing splits or streams (cross-training rows carry no detail data).
const missingDetail = (id: SourceId) => and(
  eq(activities.source, id),
  isNotNull(activities.sourceActivityId),
  inArray(activities.type, RUN_ACTIVITY_TYPES),
  or(eq(activities.hasDetailedData, false), eq(activities.hasStreams, false)),
)

// A safe message for the user: SourceErrors as they are, anything else neutral (library errors can carry request data).
export const safeError = (err: unknown) =>
  err instanceof SourceError ? err : new SourceError('unknown', 'Synchronisierung fehlgeschlagen. Bitte später erneut versuchen.')

export async function loadLastSync(id: SourceId): Promise<LastSync | null> {
  return getSettingJson<LastSync>(lastSyncKey(id))
}

// Detail data for one stored activity, from its source.
export async function enrichActivity(src: ActivitySource, activityId: string, sourceActivityId: string, plan?: PlanSession[]) {
  if (!src.getActivityDetail) throw new SourceError('invalid', 'Diese Quelle liefert keine Detaildaten nach.')
  return storeDetail(activityId, await src.getActivityDetail(sourceActivityId), plan)
}

async function enrichPending(src: ActivitySource, limit: number, r: SyncResult) {
  const pending = await db
    .select({ id: activities.id, sourceActivityId: activities.sourceActivityId })
    .from(activities)
    .where(own(activities, missingDetail(src.meta.id)))
    .orderBy(desc(activities.date))
    .limit(limit)
  for (const row of pending) {
    try {
      await enrichActivity(src, row.id, row.sourceActivityId!)
      r.enriched++
      await sleep(200)
    } catch (err) {
      r.failed++
      const e = safeError(err)
      r.log.push(`enrich failed: ${row.sourceActivityId} (${e.code})`)
      if (e.code === 'rate-limited' || e.code === 'not-connected') break
    }
  }
  const [counts] = await db.select({ n: sql<number>`count(*)::int` }).from(activities).where(own(activities, missingDetail(src.meta.id)))
  r.remaining = counts?.n ?? 0
}

// The last `days` from one source, then detail data for up to `enrichLimit` runs, newest first (8 per call keeps one
// request within 60 s). Saves the result (and a failure) as the source's last sync.
export async function syncSource(src: ActivitySource, { days = 28, enrichLimit = 8 } = {}): Promise<SyncResult> {
  const r = empty()
  try {
    if (!src.listActivities) throw new SourceError('invalid', 'Diese Quelle kann nicht synchronisiert werden.')
    const { items } = await src.listActivities({ since: new Date(Date.now() - days * 86_400_000) })
    for (const a of items) {
      const u = await upsertSummary(src.meta.id, a)
      r[u.result === 'inserted' ? 'inserted' : u.result === 'updated' ? 'updated' : 'duplicates']++
    }
    r.log.push(`${src.meta.id}: ${r.inserted} new, ${r.updated} updated, ${r.duplicates} duplicates`)
    if (src.meta.capabilities.detailStreams) await enrichPending(src, enrichLimit, r)
    r.log.push(`${src.meta.id}: enriched ${r.enriched}, remaining ${r.remaining}`)
    const { log: _, ...summary } = r
    await setSettingJson(lastSyncKey(src.meta.id), { at: new Date().toISOString(), source: src.meta.id, ...summary } satisfies LastSync)
    await src.markSynced?.(null)
    return r
  } catch (err) {
    const e = safeError(err)
    const { log: _, ...summary } = r
    await Promise.all([
      setSettingJson(lastSyncKey(src.meta.id), { at: new Date().toISOString(), source: src.meta.id, ...summary, error: e.message, errorCode: e.code } satisfies LastSync),
      src.markSynced?.(e),
    ]).catch(() => {})
    throw e
  }
}

// Every connected pull source of this user, then the plan engine (after the sync time is saved: the engine only
// treats days covered by a sync as missed; it never fails the sync). Throws only when every source failed.
export async function runSync(opts: { days?: number; enrichLimit?: number } = {}): Promise<SyncResult & { errors: { source: SourceId; code: SourceErrorCode; message: string }[] }> {
  const sources = await connectedPullSources()
  if (!sources.length) throw new SourceError('not-connected', 'Keine Datenquelle zum Synchronisieren verbunden (Einstellungen → Datenquellen).')
  const total = { ...empty(), errors: [] as { source: SourceId; code: SourceErrorCode; message: string }[] }
  for (const src of sources) {
    try {
      const r = await syncSource(src, opts)
      for (const k of ['inserted', 'updated', 'duplicates', 'enriched', 'failed', 'remaining'] as const) total[k] += r[k]
      total.log.push(...r.log)
    } catch (err) {
      const e = safeError(err)
      total.errors.push({ source: src.meta.id, code: e.code, message: e.message })
    }
  }
  if (total.errors.length === sources.length) {
    const first = total.errors[0]
    throw new SourceError(first.code, first.message)
  }
  try {
    const engine = await runAndSaveEngine()
    total.log.push(`plan engine: ${engine.log.length} changes in log`)
  } catch (err: any) {
    total.log.push(`plan engine failed: ${err?.message ?? err}`)
  }
  return total
}

// One page of a source's full history (the Settings button walks the pages).
export async function syncHistoryPage(src: ActivitySource, page: number, pageSize = 50) {
  if (!src.listActivities || !src.meta.capabilities.history) throw new SourceError('invalid', 'Diese Quelle hat keine Historie zum Nachladen.')
  const { items, hasMore } = await src.listActivities({ page, pageSize })
  let inserted = 0, updated = 0, duplicates = 0
  for (const a of items) {
    const u = await upsertSummary(src.meta.id, a)
    if (u.result === 'inserted') inserted++
    else if (u.result === 'updated') updated++
    else duplicates++
  }
  return { inserted, updated, duplicates, hasMore }
}
