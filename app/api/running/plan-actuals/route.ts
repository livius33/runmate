import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { gte } from 'drizzle-orm'
import { own } from '@/lib/db/owned'
import { allWeeks } from '@/lib/plan/blocks'
import { RUN_ACTIVITY_TYPES as RUN_TYPES, parseMetrics } from '@/lib/analytics/run-view'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'

export interface DayActual {
  date: string
  km: number
  // splitPacesS: pace of each full km split (s/km), for plan-vs-actual pace
  runs: { id: string; name: string; km: number; paceS: number | null; avgHr: number | null; splitPacesS: number[]; splitHrs: (number | null)[]; zonesS: number[] | null }[]
}

// Synced runs per day across the plan window, for plan-vs-actual on the home page.
export const GET = withUser(async () => {
  await ensureLiveBlocks()
  try {
    const rows = await db
      .select({
        id: activities.id,
        date: activities.date,
        type: activities.type,
        name: activities.name,
        distanceM: activities.distanceM,
        averagePaceSPerKm: activities.averagePaceSPerKm,
        averageHr: activities.averageHr,
        metricsJson: activities.metricsJson,
      })
      .from(activities)
      .where(own(activities, gte(activities.date, allWeeks()[0]?.start ?? '9999-12-31')))

    const byDate = new Map<string, DayActual>()
    for (const r of rows) {
      if (!RUN_TYPES.includes(r.type)) continue
      const km = Math.round(r.distanceM / 100) / 10
      const day = byDate.get(r.date) ?? { date: r.date, km: 0, runs: [] }
      day.km = Math.round((day.km + km) * 10) / 10
      const m = parseMetrics(r)
      const full = (m?.splits ?? []).filter((s) => s.distM >= 950)
      day.runs.push({ id: r.id, name: r.name, km, paceS: r.averagePaceSPerKm, avgHr: r.averageHr,
        splitPacesS: full.map((s) => s.paceS), splitHrs: full.map((s) => s.hr), zonesS: m?.zonesS ?? null })
      byDate.set(r.date, day)
    }

    return NextResponse.json([...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)))
  } catch (err: any) {
    console.error('[plan-actuals GET]', err.message)
    return NextResponse.json([], { status: 500 })
  }
})
