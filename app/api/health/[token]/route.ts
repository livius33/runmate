import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { todayLocal } from '@/lib/dates'
import { userForLinkToken } from '@/lib/links/tokens'
import { parseHealth } from '@/lib/health/parse'
import { saveHealth } from '@/lib/health/store'
import { runAsUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public (the iOS Shortcut cannot log in) but only with the secret token, which names the user. POST JSON → one day
// of Apple Health data for that user. No values are logged.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const userId = await userForLinkToken('health', token)
  if (!userId) return new NextResponse('Not found', { status: 404 })
  return runAsUser(userId, async () => {
    const body = await req.json().catch(() => null)
    const yesterday = format(addDays(parseISO(todayLocal()), -1), 'yyyy-MM-dd')
    const r = parseHealth(body, yesterday)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    const values = await saveHealth(r.day, r.workouts)
    return NextResponse.json({ ok: true, date: r.day.date, values, skippedWorkouts: r.skipped })
  })
}
