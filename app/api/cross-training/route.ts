import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { and, desc, gte, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { CROSS_TYPES, MANUAL_ID_PREFIX, parseCrossEntry } from '@/lib/analytics/cross-training'
import { crossSummary } from '@/lib/analytics/cross-view'
import { isCalendarDay, todayLocal } from '@/lib/dates'
import { withUser } from '@/lib/server/scope'
import { consentBlocked } from '@/lib/legal/intake'

export const runtime = 'nodejs'

// All cross-training sessions, newest first; ?from=&to= (yyyy-mm-dd) narrow the window. The date column is text, so
// a bound that is no calendar day ('1.5.2026', '2026-5-1') would compare as text and answer with the wrong sessions.
export const GET = withUser(async (req: Request) => {
  const p = new URL(req.url).searchParams
  const from = p.get('from'), to = p.get('to')
  const bad = from && !isCalendarDay(from) ? 'from' : to && !isCalendarDay(to) ? 'to' : null
  if (bad) return NextResponse.json({ error: `${bad}: ein Kalendertag als JJJJ-MM-TT` }, { status: 400 })
  try {
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
  // A training session (with its RPE) is health data like an imported activity (Art. 9).
  const blocked = await consentBlocked()
  if (blocked) return blocked
  const e = parsed.entry
  try {
    const row = {
      id: `${MANUAL_ID_PREFIX}${randomUUID()}`,           // older rows: prefix + milliseconds; only the prefix is ever read
      source: 'manual',
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
