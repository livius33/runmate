import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { todayInHamburg } from '@/lib/dates'
import { healthTokenMatches } from '@/lib/health/token'
import { parseHealth } from '@/lib/health/parse'
import { saveHealth } from '@/lib/health/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public (the iOS Shortcut cannot log in) but only with the secret token. POST JSON → one day of Apple Health data.
// No values are logged.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await healthTokenMatches(token))) return new NextResponse('Not found', { status: 404 })
  const body = await req.json().catch(() => null)
  const yesterday = format(addDays(parseISO(todayInHamburg()), -1), 'yyyy-MM-dd')
  const r = parseHealth(body, yesterday)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  const values = await saveHealth(r.day, r.workouts)
  return NextResponse.json({ ok: true, date: r.day.date, values, skippedWorkouts: r.skipped })
}
