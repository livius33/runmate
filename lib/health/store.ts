// Apple Health rows: upsert per day (a re-send replaces the day), and the last days for the cards.
import { desc, gte, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { healthDays, healthWorkouts } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import type { HealthDayInput, HealthWorkoutInput } from './parse'

const LAST_KEY = 'health_last_upload'

// Three writes and no transaction: the two database drivers share none (lib/db/index.ts). So the order makes a failure
// harmless instead: every step can be repeated, none removes anything before its replacement is stored, and the
// last-upload record comes last, so it only ever names an upload that was stored in full. A failure in between leaves
// the day's values new and its workouts old, or stale workouts next to the new ones; the Shortcut gets a 500 and the
// next upload of that day puts it right.
export async function saveHealth(day: HealthDayInput, workouts: HealthWorkoutInput[] | null) {
  const now = Math.floor(Date.now() / 1000)
  // Only fields that came in overwrite: a Shortcut that sends steps only keeps yesterday's weight.
  const set = Object.fromEntries(Object.entries(day).filter(([k, v]) => k !== 'date' && v != null))
  await db.insert(healthDays).values(mine({ ...day, updatedAt: now }))
    .onConflictDoUpdate({ target: [healthDays.userId, healthDays.date], set: { ...set, updatedAt: now } })
  // Sent twice in one upload: the first counts, in the table and in `values`.
  const ids = new Set<string>()
  const rows = workouts?.filter((w) => !ids.has(w.id) && ids.add(w.id))
  if (rows) {
    const days = [...new Set([day.date, ...rows.map((w) => w.date)])]
    // New and re-sent workouts first (the id is date + start + type, so only the values can differ), then the ones
    // these days no longer have. The other way round, a failed insert left the days without any workout.
    const col = (c: string) => sql.raw(`excluded."${c}"`)
    if (rows.length) await db.insert(healthWorkouts).values(rows.map(mine))
      .onConflictDoUpdate({ target: [healthWorkouts.userId, healthWorkouts.id], set: { minutes: col('minutes'), kcal: col('kcal'), avgHr: col('avg_hr') } })
    await db.delete(healthWorkouts).where(own(healthWorkouts, inArray(healthWorkouts.date, days), rows.length ? notInArray(healthWorkouts.id, [...ids]) : undefined))
  }
  const values = Object.values(set).length + (rows?.length ?? 0)
  await setSettingJson(LAST_KEY, { at: new Date().toISOString(), date: day.date, values })
  return values
}

export async function lastUpload(): Promise<{ at: string; date: string; values: number } | null> {
  return getSettingJson(LAST_KEY)
}

export async function recentHealth(fromDate: string) {
  const [days, workouts] = await Promise.all([
    db.select().from(healthDays).where(own(healthDays, gte(healthDays.date, fromDate))).orderBy(desc(healthDays.date)),
    db.select().from(healthWorkouts).where(own(healthWorkouts, gte(healthWorkouts.date, fromDate))).orderBy(desc(healthWorkouts.start)),
  ])
  return { days, workouts }
}
