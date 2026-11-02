import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { own } from '@/lib/db/owned'
import { db } from '@/lib/db'
import { activities, activityStreams } from '@/lib/db/schema'
import { analyzeRace } from '@/lib/insights/race-analysis'
import { racePlan, type PlanKind } from '@/lib/plan/race-day'
import { raceOf } from '@/lib/plan/blocks'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { withUser } from '@/lib/server/scope'
import { requireFeature } from '@/lib/billing/access'

export const runtime = 'nodejs'

const parse = (json: string | null | undefined): (number | null)[] | null => {
  if (!json) return null
  try { return JSON.parse(json) } catch { return null }
}

// A marathon run against the pacing plan: ?id=<activityId>&plan=A|B
export const GET = withUser(async (req: Request) => {
  await ensureLiveBlocks()
  const gated = await requireFeature('raceDay')
  if (gated) return gated
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const kind: PlanKind = url.searchParams.get('plan') === 'B' ? 'B' : 'A'
  if (!id) return NextResponse.json({ error: 'Lauf fehlt' }, { status: 400 })
  try {
    const [run] = await db.select().from(activities).where(own(activities, eq(activities.id, id))).limit(1)
    if (!run) return NextResponse.json({ error: 'Lauf nicht gefunden' }, { status: 404 })
    const [st] = await db.select().from(activityStreams).where(own(activityStreams, eq(activityStreams.activityId, id))).limit(1)
    const distance = parse(st?.distanceJson), time = parse(st?.timeJson)
    if (!distance || !time) return NextResponse.json({ error: 'Keine Detaildaten – erneut synchronisieren' }, { status: 404 })
    const race = raceOf(run.date)
    const result = analyzeRace({ distance, time, hr: parse(st?.heartrateJson) }, racePlan(kind, race), kind, race)
    if (!result) return NextResponse.json({ error: `Kein Rennen über ${race.distanceKm.toLocaleString('de-DE')} km in den Detaildaten` }, { status: 404 })
    return NextResponse.json({ plan: kind, date: run.date, name: run.name, ...result })
  } catch (err: any) {
    console.error('[race-analysis GET]', err.message)
    return NextResponse.json({ error: 'Rennanalyse konnte nicht berechnet werden' }, { status: 500 })
  }
})
