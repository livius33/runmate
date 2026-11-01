import { NextRequest, NextResponse } from 'next/server'
import { runGarminSync } from '@/lib/garmin/sync-job'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { log } = await runGarminSync({ days: 28 })
    return NextResponse.json({ ok: true, log, timestamp: new Date().toISOString() })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
