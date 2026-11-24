import { NextRequest, NextResponse } from 'next/server'
import { runSync } from '@/lib/sources/sync'
import { usersToSync } from '@/lib/sources/registry'
import { runAsUser } from '@/lib/server/scope'
import { cronUnauthorized } from '@/lib/server/cron-auth'
import { intakeAllowed } from '@/lib/legal/intake'

export const runtime = 'nodejs'
export const maxDuration = 60

const BATCH = 3                 // users synced at the same time
const BUDGET_MS = 45_000        // start no new batch after this; the rest go first next time (least recently synced first)

// Daily: every user with a connected pull source (lib/sources/registry.ts), each in their own scope. One user's
// failure never stops the others; the response lists counts only (no user data).
export async function GET(req: NextRequest) {
  const unauthorized = cronUnauthorized(req)
  if (unauthorized) return unauthorized

  const started = Date.now()
  const users = await usersToSync()
  let ok = 0, failed = 0, skipped = 0, inactive = 0
  for (let i = 0; i < users.length; i += BATCH) {
    if (Date.now() - started > BUDGET_MS) { skipped = users.length - i; break }
    const results = await Promise.allSettled(users.slice(i, i + BATCH).map((id) => runAsUser(id, async () => {
      // No active plan, or health-data consent missing or revoked (Phase 4): nothing is fetched for this user.
      if (!(await intakeAllowed())) return 'inactive' as const
      await runSync({ days: 28 })
      return 'ok' as const
    })))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === 'inactive') inactive++
      else if (r.status === 'fulfilled') ok++
      else { failed++; console.error('[cron/daily-sync] user sync failed:', r.reason?.code ?? 'unknown') }
    }
  }
  return NextResponse.json({ ok: true, users: users.length, synced: ok, failed, skipped, inactive, timestamp: new Date().toISOString() })
}
