import { NextResponse } from 'next/server'
import { runSync } from '@/lib/sources/sync'
import { sourceErrorResponse } from '@/lib/sources/http'
import { withUser } from '@/lib/server/scope'
import { intakeBlocked } from '@/lib/legal/intake'

export const runtime = 'nodejs'
export const maxDuration = 60

// The sync button: every connected pull source, last 28 days plus detail data for up to 8 runs, newest first.
export const POST = withUser(async () => {
  const blocked = await intakeBlocked()
  if (blocked) return blocked
  try {
    return NextResponse.json({ ok: true, ...(await runSync()) })
  } catch (err) {
    return sourceErrorResponse(err, 'sources/sync')
  }
})
