import { NextResponse } from 'next/server'
import { runGarminSync } from '@/lib/garmin/sync-job'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const maxDuration = 60

// The sync button: last 28 days plus detail data for up to 8 runs, newest first.
export const POST = withUser(async () => {
  try {
    const { log, ...result } = await runGarminSync()
    return NextResponse.json({ ok: true, ...result, log })
  } catch (err: any) {
    console.error('[garmin/sync]', err)
    return NextResponse.json({ ok: false, error: err.message ?? String(err) }, { status: 500 })
  }
})
