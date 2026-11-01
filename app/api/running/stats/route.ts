import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activities, activityStreams } from '@/lib/db/schema'
import { loadPlan } from '@/lib/plan/load'
import { blocks } from '@/lib/plan/blocks'
import { gte, inArray } from 'drizzle-orm'
import { own } from '@/lib/db/owned'
import { subDays, subMonths, format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, differenceInCalendarDays } from 'date-fns'
import { RUN_ACTIVITY_TYPES as RUN_TYPES } from '@/lib/analytics/run-view'

// Races of all blocks, read per request (live blocks are registered at runtime).
const races = () => blocks().filter((b) => !b.base).map((b) => ({ name: b.race.name, date: b.race.date }))

import { hrZones } from '@/lib/analytics/hr'
import { acwr as acwrOf, acwrSeries } from '@/lib/analytics/load'
import { localDate } from '@/lib/dates'

function computeHrZones(hr: number[]): Record<string, number> {
  const zones: Record<string, number> = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 }
  for (const bpm of hr) {
    for (const z of hrZones()) {
      if (bpm >= z.min && bpm < z.max) {
        zones[z.name]++
        break
      }
    }
  }
  return zones
}

export type { PlanSession } from '@/lib/plan/types'
import type { PlanSession } from '@/lib/plan/types'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'

export interface WeekDay {
  date: string
  dayName: string
  planned: PlanSession | null
  actual: { km: number; type: string; name: string } | null
}

export const GET = withUser(async () => {
  await ensureLiveBlocks()
  try {
  // Sync-connected proxy: true if we have any activity in the DB.
  const [existing] = await db.select({ id: activities.id }).from(activities).where(own(activities)).limit(1)
  const stravaConnected = !!existing

  // All windows on the runner's calendar date (the server runs in UTC).
  const now = localDate()
  const since28d = format(subDays(now, 28), 'yyyy-MM-dd')
  const since6m = format(subMonths(now, 6), 'yyyy-MM-dd')

  // Load all runs for the last 6 months (superset needed for monthly chart)
  const allActivities6m = await db
    .select()
    .from(activities)
    .where(own(activities, gte(activities.date, since6m)))

  const runs28d = allActivities6m.filter(
    (a) => RUN_TYPES.includes(a.type) && a.date >= since28d
  )
  const runs6m = allActivities6m.filter((a) => RUN_TYPES.includes(a.type))

  // Current week Mon–Sun
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')

  // Load plan
  const plan: PlanSession[] = await loadPlan()

  // Build week grid
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).map((d) => {
    const dateStr = format(d, 'yyyy-MM-dd')
    const dayName = format(d, 'EEE')
    const planned = plan.find((p) => p.date === dateStr) ?? null
    const dayRuns = runs28d.filter((r) => r.date === dateStr)
    const actual = dayRuns.length > 0
      ? {
          km: Math.round(dayRuns.reduce((s, r) => s + r.distanceM / 1000, 0) * 10) / 10,
          type: dayRuns[0].type,
          name: dayRuns[0].name,
        }
      : null
    return { date: dateStr, dayName, planned, actual } as WeekDay
  })

  const weekRuns = runs28d.filter((r) => r.date >= weekStartStr && r.date <= weekEndStr)
  const weeklyKm = Math.round(weekRuns.reduce((sum, r) => sum + r.distanceM / 1000, 0) * 10) / 10
  const weeklyPlannedKm = Math.round(
    weekDays.reduce((s, d) => s + (d.planned?.km ?? 0), 0) * 10
  ) / 10
  const weeklyElevationM = Math.round(
    weekRuns.reduce((s, r) => s + (r.elevationM ?? 0), 0)
  )
  const weekCadenceRuns = weekRuns.filter((r) => r.avgCadence != null)
  const weeklyAvgCadence = weekCadenceRuns.length > 0
    ? Math.round(weekCadenceRuns.reduce((s, r) => s + (r.avgCadence ?? 0), 0) / weekCadenceRuns.length)
    : null

  // ACWR (shared model, lib/analytics/load.ts)
  const { acwr, acuteKm, chronicKm } = acwrOf(runs6m, now)

  // Race countdowns
  const today = now
  const raceCountdowns = races().map((r) => ({
    ...r,
    daysUntil: differenceInCalendarDays(parseISO(r.date), today),
  })).filter((r) => r.daysUntil > 0)

  const recentRuns = runs28d.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  // Monthly km for last 6 months
  const monthlyMap: Record<string, number> = {}
  for (const run of runs6m) {
    const month = run.date.slice(0, 7)
    monthlyMap[month] = (monthlyMap[month] ?? 0) + run.distanceM / 1000
  }
  const monthlyKm = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, km]) => ({ month, km: Math.round(km * 10) / 10 }))

  // HR zone breakdown from streams (last 28 days)
  const runsWithStreams = runs28d.filter((r) => r.hasStreams)
  let hrZones28d: Record<string, number> | null = null

  if (runsWithStreams.length > 0) {
    const streamRows = await db
      .select({ activityId: activityStreams.activityId, heartrateJson: activityStreams.heartrateJson })
      .from(activityStreams)
      .where(own(activityStreams, inArray(activityStreams.activityId, runsWithStreams.map((r) => r.id))))

    const streamMap = new Map(streamRows.map((s) => [s.activityId, s.heartrateJson]))
    const combined: number[] = []
    for (const run of runsWithStreams) {
      const hrJson = streamMap.get(run.id)
      if (!hrJson) continue
      try {
        const arr: (number | null)[] = JSON.parse(hrJson)
        combined.push(...arr.filter((v): v is number => v != null))
      } catch { /* skip */ }
    }
    if (combined.length > 0) {
      hrZones28d = computeHrZones(combined)
    }
  }

  // Enrichment status (runs: cross-training rows carry no detail data)
  const allRuns = await db.select({ total: activities.id, detail: activities.hasDetailedData, streams: activities.hasStreams }).from(activities)
    .where(own(activities, inArray(activities.type, RUN_TYPES)))
  const totalActivities = allRuns.length
  const withDetail = allRuns.filter((r) => r.detail).length
  const withStreams = allRuns.filter((r) => r.streams).length

  return NextResponse.json({
    stravaConnected,
    weeklyKm,
    weeklyPlannedKm,
    weeklyElevationM,
    weeklyAvgCadence,
    acwr: Math.round(acwr * 100) / 100,
    acwrRecent: acwrSeries(runs6m, now).map((v) => (v == null ? null : Math.round(v * 100) / 100)),   // today first (07-23)
    acuteKm: Math.round(acuteKm * 10) / 10,
    chronicKm: Math.round(chronicKm * 10) / 10,
    weekDays,
    recentRuns,
    raceCountdowns,
    hasPlan: plan.length > 0,
    monthlyKm,
    hrZones28d,
    enrichmentStatus: { totalActivities, withDetail, withStreams },
  })
  } catch (err: any) {
    console.error('[stats GET]', err.message)
    return NextResponse.json({ stravaConnected: false, weeklyKm: 0, acwr: 0, acwrRecent: [], weekDays: [], recentRuns: [], raceCountdowns: [], monthlyKm: [], hasPlan: false })
  }
})
