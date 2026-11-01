// Apple Health rows: upsert per day (a re-send replaces the day), and the last days for the cards.
import { desc, gte, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { healthDays, healthWorkouts } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import type { HealthDayInput, HealthWorkoutInput } from './parse'

const LAST_KEY = 'health_last_upload'

export async function saveHealth(day: HealthDayInput, workouts: HealthWorkoutInput[] | null) {
  const now = Math.floor(Date.now() / 1000)
  // Only fields that came in overwrite: a Shortcut that sends steps only keeps yesterday's weight.
  const set = Object.fromEntries(Object.entries(day).filter(([k, v]) => k !== 'date' && v != null))
  await db.insert(healthDays).values(mine({ ...day, updatedAt: now }))
    .onConflictDoUpdate({ target: [healthDays.userId, healthDays.date], set: { ...set, updatedAt: now } })
  if (workouts) {
    const days = [...new Set([day.date, ...workouts.map((w) => w.date)])]
    await db.delete(healthWorkouts).where(own(healthWorkouts, inArray(healthWorkouts.date, days)))
    if (workouts.length) await db.insert(healthWorkouts).values(workouts.map(mine)).onConflictDoNothing()
  }
  const values = Object.values(set).length + (workouts?.length ?? 0)
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
