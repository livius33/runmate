import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { enrichActivityDetail, enrichActivityStreams } from '@/lib/api-clients/garmin'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST …/enrich loads missing Garmin data; POST …/enrich?force=1 re-imports it.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const [act] = await db
    .select({
      garminActivityId: activities.garminActivityId,
      hasDetailedData: activities.hasDetailedData,
      hasStreams: activities.hasStreams,
    })
    .from(activities)
    .where(eq(activities.id, id))
    .limit(1)

  if (!act) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!act.garminActivityId) {
    return NextResponse.json(
      { error: 'Legacy Strava activity — no Garmin id to enrich' },
      { status: 409 },
    )
  }

  const force = new URL(req.url).searchParams.has('force')
  try {
    if (force || !act.hasDetailedData) await enrichActivityDetail(act.garminActivityId)
    if (force || !act.hasStreams)      await enrichActivityStreams(act.garminActivityId)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[activity enrich]', err)
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 })
  }
}
