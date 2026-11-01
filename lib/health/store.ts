// Apple Health rows: upsert per day (a re-send replaces the day), and the last days for the cards.
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { healthDays, healthWorkouts, settings } from '@/lib/db/schema'
import type { HealthDayInput, HealthWorkoutInput } from './parse'

const LAST_KEY = 'health_last_upload'

export async function saveHealth(day: HealthDayInput, workouts: HealthWorkoutInput[] | null) {
  const now = Math.floor(Date.now() / 1000)
  // Only fields that came in overwrite: a Shortcut that sends steps only keeps yesterday's weight.
  const set = Object.fromEntries(Object.entries(day).filter(([k, v]) => k !== 'date' && v != null))
  await db.insert(healthDays).values({ ...day, updatedAt: now })
    .onConflictDoUpdate({ target: healthDays.date, set: { ...set, updatedAt: now } })
  if (workouts) {
    const days = [...new Set([day.date, ...workouts.map((w) => w.date)])]
    await db.delete(healthWorkouts).where(inArray(healthWorkouts.date, days))
    if (workouts.length) await db.insert(healthWorkouts).values(workouts).onConflictDoNothing()
  }
  const values = Object.values(set).length + (workouts?.length ?? 0)
  const value = JSON.stringify({ at: new Date().toISOString(), date: day.date, values })
  await db.insert(settings).values({ key: LAST_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return values
}

export async function lastUpload(): Promise<{ at: string; date: string; values: number } | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, LAST_KEY))
  try { return row ? JSON.parse(row.value) : null } catch { return null }
}

export async function recentHealth(fromDate: string) {
  const [days, workouts] = await Promise.all([
    db.select().from(healthDays).where(gte(healthDays.date, fromDate)).orderBy(desc(healthDays.date)),
    db.select().from(healthWorkouts).where(and(gte(healthWorkouts.date, fromDate))).orderBy(desc(healthWorkouts.start)),
  ])
  return { days, workouts }
}
