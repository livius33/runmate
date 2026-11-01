import { NextResponse } from 'next/server'
import { format, subDays } from 'date-fns'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { fitnessSeries } from '@/lib/analytics/load'
import { localDate } from '@/lib/dates'
import { withUser } from '@/lib/server/scope'

// ?days=N limits the returned timeline (default 120); CTL/ATL are always computed from the start.
export const GET = withUser(async (req: Request) => {
  try {
    const today = localDate()
    const days = Math.min(4000, Math.max(7, Number(new URL(req.url).searchParams.get('days')) || 120))
    const chartStart = format(subDays(today, days), 'yyyy-MM-dd')
    const series = fitnessSeries(await db.select().from(activities).where(own(activities)), today)
    return NextResponse.json(series.filter((p) => p.date >= chartStart))
  } catch (err: any) {
    console.error('[fitness GET]', err.message)
    return NextResponse.json([])
  }
})
