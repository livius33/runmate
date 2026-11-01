import { NextRequest, NextResponse } from 'next/server'
import { runGarminSync } from '@/lib/garmin/sync-job'
import { garminUserIds } from '@/lib/garmin/account'
import { runAsUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const maxDuration = 60

const BATCH = 3                 // users synced at the same time
const BUDGET_MS = 45_000        // start no new batch after this; the rest go first next time (least recently synced first)

// Daily: every user with a Garmin account, each in their own scope. One user's failure never stops the others; the
// response lists counts only (no user data).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const users = await garminUserIds()
  let ok = 0, failed = 0, skipped = 0
  for (let i = 0; i < users.length; i += BATCH) {
    if (Date.now() - started > BUDGET_MS) { skipped = users.length - i; break }
    const results = await Promise.allSettled(users.slice(i, i + BATCH).map((id) => runAsUser(id, () => runGarminSync({ days: 28 }))))
    for (const r of results) {
      if (r.status === 'fulfilled') ok++
      else { failed++; console.error('[cron/daily-sync] user sync failed:', r.reason?.message ?? r.reason) }
    }
  }
  return NextResponse.json({ ok: true, users: users.length, synced: ok, failed, skipped, timestamp: new Date().toISOString() })
}
