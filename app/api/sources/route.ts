import { NextResponse } from 'next/server'
import { SOURCES } from '@/lib/sources/registry'
import { loadLastSync, safeError, type LastSync } from '@/lib/sources/sync'
import { CONSENT_TEXT } from '@/lib/sources/garmin-login'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// Every data source with this user's status (booleans, timestamps, error codes; never credentials) and, for pull
// sources, the last sync. `lastSync` is the newest of them (header button).
export const GET = withUser(async () => {
  const sources = await Promise.all(SOURCES.map(async (s) => {
    const pull = s.meta.available && s.meta.capabilities.mode === 'pull'
    const [status, lastSync] = await Promise.all([
      s.status().catch((err) => ({ connected: false, lastSyncAt: null, error: { ...pick(safeError(err)), at: null } })),
      pull ? loadLastSync(s.meta.id) : Promise.resolve(null),
    ])
    return { ...s.meta, status, lastSync, ...(s.meta.auth === 'credentials' ? { consent: CONSENT_TEXT } : {}) }
  }))
  const syncable = sources.filter((s) => s.available && s.capabilities.mode === 'pull' && s.status.connected)
  const lastSync = syncable.map((s) => s.lastSync).filter((l): l is LastSync => !!l).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
  return NextResponse.json({ sources, canSync: syncable.length > 0, lastSync })
})

const pick = (e: { code: string; message: string }) => ({ code: e.code, message: e.message })
