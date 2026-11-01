import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { todayLocal } from '@/lib/dates'
import { recentHealth } from '@/lib/health/store'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// Behind Clerk (not under /api/health/, which is public for the Shortcut): the last 14 days.
export const GET = withUser(async () => {
  const from = format(addDays(parseISO(todayLocal()), -14), 'yyyy-MM-dd')
  return NextResponse.json(await recentHealth(from))
})
