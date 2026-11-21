import { NextRequest, NextResponse } from 'next/server'
import { runAsUser } from '@/lib/server/scope'
import { cronUnauthorized } from '@/lib/server/cron-auth'
import { todayLocal } from '@/lib/dates'
import { DEMO_PROFILE, DEMO_USER_ID } from '@/lib/demo/athlete'
import { demoEnabled, resetDemo } from '@/lib/demo/store'

export const runtime = 'nodejs'
export const maxDuration = 60

// Nightly (Phase 5, demo deployments only): the demo athlete's data is regenerated for today, so visitors always see
// week 9 of the 12-week block and nothing a visitor might have changed (nothing can be) survives a day.
export async function GET(req: NextRequest) {
  const unauthorized = cronUnauthorized(req)
  if (unauthorized) return unauthorized
  if (!demoEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const counts = await runAsUser(DEMO_USER_ID, async () => resetDemo(todayLocal()), { profile: DEMO_PROFILE })
  return NextResponse.json({ ok: true, ...counts })
}
