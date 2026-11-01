import { NextResponse } from 'next/server'
import { format, subDays } from 'date-fns'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { fitnessSeries } from '@/lib/analytics/load'
import { hamburgDate } from '@/lib/dates'

// ?days=N limits the returned timeline (default 120); CTL/ATL are always computed from the start.
export async function GET(req: Request) {
  try {
    const today = hamburgDate()
    const days = Math.min(4000, Math.max(7, Number(new URL(req.url).searchParams.get('days')) || 120))
    const chartStart = format(subDays(today, days), 'yyyy-MM-dd')
    const series = fitnessSeries(await db.select().from(activities), today)
    return NextResponse.json(series.filter((p) => p.date >= chartStart))
  } catch (err: any) {
    console.error('[fitness GET]', err.message)
    return NextResponse.json([])
  }
}
