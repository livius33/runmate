import { NextResponse } from 'next/server'
import { and, desc, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { CROSS_TYPES, MANUAL_ID_PREFIX, parseCrossEntry } from '@/lib/analytics/cross-training'
import { crossSummary } from '@/lib/analytics/cross-view'
import { todayLocal } from '@/lib/dates'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// All cross-training sessions, newest first; ?from=&to= (yyyy-mm-dd) narrow the window.
export const GET = withUser(async (req: Request) => {
  try {
    const p = new URL(req.url).searchParams
    const from = p.get('from'), to = p.get('to')
    const where = [inArray(activities.type, CROSS_TYPES)]
    if (from) where.push(gte(activities.date, from))
    if (to) where.push(lte(activities.date, to))
    const rows = await db.select().from(activities).where(own(activities, ...where)).orderBy(desc(activities.date), desc(activities.startTime))
    return NextResponse.json(rows.map(crossSummary))
  } catch (err: any) {
    console.error('[cross-training GET]', err.message)
    return NextResponse.json({ error: 'Einheiten konnten nicht geladen werden' }, { status: 500 })
  }
})

// A session without a watch: { date, sport, minutes, rpe?, name? } → manual activities row (distance 0, no streams).
export const POST = withUser(async (req: Request) => {
  const parsed = parseCrossEntry(await req.json().catch(() => null), todayLocal())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const e = parsed.entry
  try {
    const row = {
      id: `${MANUAL_ID_PREFIX}${Date.now()}`,
      type: e.type,
      sportType: 'manual',
      name: e.name,
      distanceM: 0,
      durationS: e.minutes * 60,
      elapsedTimeS: e.minutes * 60,
      perceivedExertion: e.rpe,
      date: e.date,
    }
    await db.insert(activities).values(mine(row))
    const [saved] = await db.select().from(activities).where(own(activities, inArray(activities.id, [row.id]))).limit(1)
    return NextResponse.json(crossSummary(saved), { status: 201 })
  } catch (err: any) {
    console.error('[cross-training POST]', err.message)
    return NextResponse.json({ error: 'Einheit konnte nicht gespeichert werden' }, { status: 500 })
  }
})
