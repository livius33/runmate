import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { todayLocal } from '@/lib/dates'
import { userForLinkToken } from '@/lib/links/tokens'
import { parseHealth } from '@/lib/health/parse'
import { saveHealth } from '@/lib/health/store'
import { hasOtherRunSource } from '@/lib/sources/registry'
import { upsertSummary } from '@/lib/sources/ingest'
import { runAsUser } from '@/lib/server/scope'
import { intakeBlocked } from '@/lib/legal/intake'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public (the iOS Shortcut cannot log in) but only with the secret token, which names the user. POST JSON → one day
// of Apple Health data for that user. Running workouts count only when no other connected source delivers runs
// (otherwise they would count twice); they are deduplicated and checked for impossible values like every import. No values are logged.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const userId = await userForLinkToken('health', token)
  if (!userId) return new NextResponse('Not found', { status: 404 })
  return runAsUser(userId, async () => {
    const blocked = await intakeBlocked()
    if (blocked) return blocked
    const body = await req.json().catch(() => null)
    const yesterday = format(addDays(parseISO(todayLocal()), -1), 'yyyy-MM-dd')
    const keepRuns = !(await hasOtherRunSource('apple-health'))
    const r = parseHealth(body, yesterday, { keepRuns })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    const values = await saveHealth(r.day, r.workouts)
    let runs = 0, duplicateRuns = 0, rejectedRuns = 0
    for (const run of r.runs) {
      const u = await upsertSummary('apple-health', run)
      if (u.result === 'duplicate') duplicateRuns++
      else if (u.result === 'rejected') rejectedRuns++      // impossible values (ingest.ts PLAUSIBLE): not stored
      else runs++
    }
    return NextResponse.json({ ok: true, date: r.day.date, values, runs, duplicateRuns, rejectedRuns, skippedWorkouts: r.skipped })
  })
}
