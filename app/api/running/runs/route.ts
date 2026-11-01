import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { desc, inArray } from 'drizzle-orm'
import { own } from '@/lib/db/owned'
import { RUN_ACTIVITY_TYPES, runSummary } from '@/lib/analytics/run-view'
import { withUser } from '@/lib/server/scope'

// All runs, newest first. Filtering by type and paging happen on the client:
// ~500 rows of summary data is small, and it keeps the type counts exact.
export const GET = withUser(async () => {
  try {
    const rows = await db
      .select()
      .from(activities)
      .where(own(activities, inArray(activities.type, RUN_ACTIVITY_TYPES)))
      .orderBy(desc(activities.date), desc(activities.startTime))
    return NextResponse.json(rows.map(runSummary))
  } catch (err: any) {
    console.error('[runs GET]', err.message)
    return NextResponse.json({ error: 'Läufe konnten nicht geladen werden' }, { status: 500 })
  }
})
