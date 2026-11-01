import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { todayInHamburg } from '@/lib/dates'
import { recentHealth } from '@/lib/health/store'

export const runtime = 'nodejs'

// Behind Clerk (not under /api/health/, which is public for the Shortcut): the last 14 days.
export async function GET() {
  const from = format(addDays(parseISO(todayInHamburg()), -14), 'yyyy-MM-dd')
  return NextResponse.json(await recentHealth(from))
}
