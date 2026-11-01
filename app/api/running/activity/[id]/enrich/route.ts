import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { own } from '@/lib/db/owned'
import { source } from '@/lib/sources/registry'
import { enrichActivity } from '@/lib/sources/sync'
import { sourceErrorResponse } from '@/lib/sources/http'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST …/enrich loads missing detail data from the activity's source; POST …/enrich?force=1 re-imports it.
export const POST = withUser(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params

  const [act] = await db
    .select({
      source: activities.source,
      sourceActivityId: activities.sourceActivityId,
      hasDetailedData: activities.hasDetailedData,
      hasStreams: activities.hasStreams,
    })
    .from(activities)
    .where(own(activities, eq(activities.id, id)))
    .limit(1)

  if (!act) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const src = source(act.source)
  if (!act.sourceActivityId || !src?.getActivityDetail) {
    return NextResponse.json({ error: 'Für diese Aktivität gibt es keine Detaildaten zum Nachladen.' }, { status: 409 })
  }

  const force = new URL(req.url).searchParams.has('force')
  try {
    if (force || !act.hasDetailedData || !act.hasStreams) await enrichActivity(src, id, act.sourceActivityId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return sourceErrorResponse(err, 'activity enrich')
  }
})
