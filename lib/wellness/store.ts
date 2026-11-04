// wellness_days: the nights a pull source delivered (the Garmin login), plus the Apple Health sleep fallback
// (health_days). Every reader tolerates the table not existing yet (deployed before the migration): it reads as no data.
import { eq, gte, sql } from 'drizzle-orm'
import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/lib/db'
import { healthDays, wellnessDays } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import type { DailyWellness, SourceId, WellnessNight } from '@/lib/sources/types'
import { BASELINE_DAYS, recoveryDay, withAppleSleep, type RecoveryFitness } from '@/lib/analytics/recovery-data'

export interface StoredNight extends WellnessNight { fetchedAt: number }

// Postgres 42P01 = undefined_table; neon/drizzle wrap the driver error in `cause`.
export function isMissingTable(err: unknown, table = 'wellness_days'): boolean {
  for (let e = err as { code?: unknown; message?: unknown; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (e.code === '42P01') return true
    if (typeof e.message === 'string' && e.message.includes(`relation "${table}" does not exist`)) return true
  }
  return false
}

const toNight = (r: typeof wellnessDays.$inferSelect): StoredNight => ({
  date: r.date, sleepS: r.sleepS, deepS: r.deepS, remS: r.remS, sleepScore: r.sleepScore, hrvAvg: r.hrvAvg,
  hrvStatus: r.hrvStatus, rhr: r.rhr, rhrSource: r.rhrSource === 'night' || r.rhrSource === 'day' ? r.rhrSource : null, fetchedAt: r.fetchedAt,
})

// Throws on a missing table: the sync step decides what to do (skip and log).
export async function loadStoredNights(from: string): Promise<StoredNight[]> {
  const rows = await db.select().from(wellnessDays).where(own(wellnessDays, gte(wellnessDays.date, from)))
  return rows.map(toNight)
}

export async function saveNights(source: SourceId, nights: WellnessNight[], nowS = Math.floor(Date.now() / 1000)) {
  if (!nights.length) return
  const values = nights.map(({ sleepSource: _, ...n }) => mine({ ...n, source, fetchedAt: nowS }))
  const col = (c: string) => sql.raw(`excluded."${c}"`)
  await db.insert(wellnessDays).values(values).onConflictDoUpdate({
    target: [wellnessDays.userId, wellnessDays.date],
    set: {
      source: col('source'), sleepS: col('sleep_s'), deepS: col('deep_s'), remS: col('rem_s'), sleepScore: col('sleep_score'),
      hrvAvg: col('hrv_avg'), hrvStatus: col('hrv_status'), rhr: col('rhr'), rhrSource: col('rhr_source'), fetchedAt: col('fetched_at'),
    },
  })
}

// One stored night as the source contract's daily values (ActivitySource.getDaily); null without a row or table.
export async function loadDaily(date: string): Promise<DailyWellness | null> {
  try {
    const [row] = await db.select().from(wellnessDays).where(own(wellnessDays, eq(wellnessDays.date, date))).limit(1)
    if (!row) return null
    return {
      date: row.date, sleepMin: row.sleepS != null ? Math.round(row.sleepS / 60) : null, restingHr: row.rhr, hrvMs: row.hrvAvg,
      steps: null, activeKcal: null, weightKg: null,
    }
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

// Nights for the cards and the engine: the source's nights first, Apple sleep duration where it has no night.
// `table: false` while wellness_days does not exist (nothing is shown then).
export async function loadRecoveryNights(from: string): Promise<{ table: boolean; nights: WellnessNight[] }> {
  let pulled: WellnessNight[]
  try {
    pulled = (await loadStoredNights(from)).map(({ fetchedAt: _, ...n }) => n)
  } catch (err) {
    if (isMissingTable(err)) return { table: false, nights: [] }
    throw err
  }
  const apple = await db.select({ date: healthDays.date, sleepMin: healthDays.sleepMin }).from(healthDays)
    .where(own(healthDays, gte(healthDays.date, from))).catch(() => [])
  return { table: true, nights: withAppleSleep(pulled, apple) }
}

// Today's flags for the plan engine and the Werkstatt; undefined without data or table (engine unchanged).
export async function loadRecoveryToday(today: string): Promise<RecoveryFitness | undefined> {
  try {
    const from = format(addDays(parseISO(today), -BASELINE_DAYS), 'yyyy-MM-dd')
    const { nights } = await loadRecoveryNights(from)
    const day = recoveryDay(nights, today)
    return day.flags.length ? { date: today, flags: day.flags } : undefined
  } catch {
    return undefined
  }
}
