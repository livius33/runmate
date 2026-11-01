// Source `apple-health`: an iOS Shortcut posts the day's values (and optionally workouts) to the user's secret link
// (/api/health/[token], lib/links/tokens.ts). The link is the connection; there is nothing to pull.
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { healthDays } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { deleteLinkToken, getLinkToken, rotateLinkToken } from '@/lib/links/tokens'
import { lastUpload } from '@/lib/health/store'
import type { ActivitySource, DailyWellness } from './types'

export const appleHealthSource: ActivitySource = {
  meta: {
    id: 'apple-health',
    label: 'Apple Health',
    description: 'Schlaf, Ruhepuls, HRV, Schritte, aktive Energie und Gewicht per iOS-Kurzbefehl; Workouts optional.',
    auth: 'link',
    available: true,
    // Running workouts only count when no other source provides runs (lib/sources/registry.ts hasOtherRunSource).
    capabilities: { activities: true, detailStreams: false, dailyWellness: true, mode: 'push', history: false, runs: true },
  },

  async status() {
    const [token, last] = await Promise.all([getLinkToken('health'), lastUpload()])
    return { connected: !!token, lastSyncAt: last?.at ?? null, error: null, details: { lastDate: last?.date ?? null, lastValues: last?.values ?? null } }
  },

  // A (new) upload link; the old one stops working.
  async connect() {
    await rotateLinkToken('health')
    return appleHealthSource.status()
  },

  async disconnect() {
    await deleteLinkToken('health')
  },

  async getDaily(date: string): Promise<DailyWellness | null> {
    const [row] = await db.select().from(healthDays).where(own(healthDays, eq(healthDays.date, date))).limit(1)
    if (!row) return null
    const { date: d, sleepMin, restingHr, hrvMs, steps, activeKcal, weightKg } = row
    return { date: d, sleepMin, restingHr, hrvMs, steps, activeKcal, weightKg }
  },
}
