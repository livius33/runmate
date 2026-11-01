import { NextResponse } from 'next/server'
import { format, subDays } from 'date-fns'
import { gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { dailyLoadsBySport } from '@/lib/analytics/load'
import { localDate } from '@/lib/dates'
import { withUser } from '@/lib/server/scope'

export interface LoadDay { date: string; run: number; strength: number; swim: number; bike: number; gym: number }

// Load per day and sport for the last ?days=N (default 120): Analyse → Belastung nach Sport.
export const GET = withUser(async (req: Request) => {
  try {
    const days = Math.min(4000, Math.max(7, Number(new URL(req.url).searchParams.get('days')) || 120))
    const since = format(subDays(localDate(), days), 'yyyy-MM-dd')
    const rows = await db.select().from(activities).where(own(activities, gte(activities.date, since)))
    const by = dailyLoadsBySport(rows)
    const r1 = (n: number | undefined) => Math.round((n ?? 0) * 10) / 10
    const out: LoadDay[] = Object.keys(by).sort().map((date) => ({
      date, run: r1(by[date].run), strength: r1(by[date].strength), swim: r1(by[date].swim), bike: r1(by[date].bike), gym: r1(by[date].gym),
    }))
    return NextResponse.json(out)
  } catch (err: any) {
    console.error('[cross-training load GET]', err.message)
    return NextResponse.json([])
  }
})
