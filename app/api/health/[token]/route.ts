import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { todayLocal } from '@/lib/dates'
import { userForLinkToken } from '@/lib/links/tokens'
import { parseHealth } from '@/lib/health/parse'
import { saveHealth } from '@/lib/health/store'
import { hasOtherRunSource } from '@/lib/sources/registry'
import { upsertSummary } from '@/lib/sources/ingest'
import { runAndSaveEngine } from '@/lib/plan/engine-store'
import { ensureLiveBlocks } from '@/lib/plan/live-blocks'
import { runAsUser } from '@/lib/server/scope'
import { intakeBlocked } from '@/lib/legal/intake'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public (the iOS Shortcut cannot log in) but only with the secret token, which names the user. POST JSON → one day
// of Apple Health data for that user. Running workouts count only when no other connected source delivers runs
// (otherwise they would count twice); they are deduplicated and checked for impossible values like every import, and
// the plan engine runs after them. No values are logged.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const userId = await userForLinkToken('health', token)
  if (!userId) return new NextResponse('Not found', { status: 404 })
  return runAsUser(userId, async () => {
    const blocked = await intakeBlocked()
    if (blocked) return blocked
    const body = await req.json().catch(() => null)
    const day = (n: number) => format(addDays(parseISO(todayLocal()), n), 'yyyy-MM-dd')
    // No date sent: yesterday. A date sent: a real day, at most tomorrow (the phone may be a day ahead of the
    // profile's time zone), else 400.
    const yesterday = day(-1), tomorrow = day(1)
    const keepRuns = !(await hasOtherRunSource('apple-health'))
    const r = parseHealth(body, yesterday, { keepRuns, latest: tomorrow })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    // Runs first, the day last: saveHealth ends with the last-upload record, which must only name an upload that was
    // stored in full. A failure in between is a 500 without that record; the Shortcut sends again and the runs
    // already stored are updated, not doubled.
    let runs = 0, duplicateRuns = 0, rejectedRuns = 0
    for (const run of r.runs) {
      const u = await upsertSummary('apple-health', run)
      if (u.result === 'duplicate') duplicateRuns++
      else if (u.result === 'rejected') rejectedRuns++      // impossible values (ingest.ts PLAUSIBLE): not stored
      else runs++
    }
    const values = await saveHealth(r.day, r.workouts)
    // Stored runs adapt the plan like an import (app/api/import/route.ts), for the token's user; never fails the upload.
    // The engine plans with the user's own blocks, so they are loaded first (they live in this user's scope).
    if (runs > 0) {
      try {
        await ensureLiveBlocks()
        await runAndSaveEngine()
      } catch (err) {
        console.error('[health] plan engine failed:', (err as Error)?.message)
      }
    }
    return NextResponse.json({ ok: true, date: r.day.date, values, runs, duplicateRuns, rejectedRuns, skippedWorkouts: r.skipped })
  })
}
