import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { own } from '@/lib/db/owned'
import { RUN_ACTIVITY_TYPES, effectiveType, parseMetrics } from '@/lib/analytics/run-view'
import { withUser } from '@/lib/server/scope'

// Compact row per run for the Analyse page; all aggregation happens client-side so the
// period switch is instant. ~500 runs ≈ 60 KB.
export const GET = withUser(async () => {
  try {
    const rows = await db.select().from(activities).where(own(activities, inArray(activities.type, RUN_ACTIVITY_TYPES)))
    const out = rows.map((r) => {
      const m = parseMetrics(r)
      return {
        id: r.id,
        date: r.date,
        km: Math.round(r.distanceM / 10) / 100,
        movingS: m?.movingS ?? r.durationS,
        elevationM: r.elevationM != null ? Math.round(r.elevationM) : 0,
        hr: r.averageHr,
        type: effectiveType(r, m),
        eff: m?.effMpb ?? null,
        zonesS: m?.zonesS ?? null,
        best: m?.best ?? {},
        cadence: r.avgCadence,
      }
    })
    out.sort((a, b) => a.date.localeCompare(b.date))
    return NextResponse.json(out)
  } catch (err: any) {
    console.error('[analytics GET]', err.message)
    return NextResponse.json({ error: 'Analyse konnte nicht geladen werden' }, { status: 500 })
  }
})

export type AnalyticsRun = {
  id: string; date: string; km: number; movingS: number; elevationM: number; hr: number | null
  type: import('@/lib/analytics/run-metrics').RunType; eff: number | null; zonesS: number[] | null
  best: Partial<Record<import('@/lib/analytics/run-metrics').BestKey, number>>; cadence: number | null
}
