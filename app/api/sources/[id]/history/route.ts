import { NextResponse } from 'next/server'
import { source } from '@/lib/sources/registry'
import { syncHistoryPage } from '@/lib/sources/sync'
import { sourceErrorResponse } from '@/lib/sources/http'
import { withUser } from '@/lib/server/scope'
import { intakeBlocked } from '@/lib/legal/intake'
import { LIMITS, throttle } from '@/lib/server/throttle'

export const runtime = 'nodejs'
export const maxDuration = 60

// One page (50) of a source's full history: { page } → { inserted, updated, duplicates, rejected, hasMore }.
// Limits (12-04): a new import (page 0) every five minutes, 200 pages an hour. The first import is never held up.
export const POST = withUser(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const blocked = await intakeBlocked()
  if (blocked) return blocked
  const src = source((await params).id)
  if (!src?.meta.available) return NextResponse.json({ error: 'Unbekannte Quelle' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const page = Math.max(0, Math.floor(Number(body?.page ?? 0)) || 0)
  const limited = (page === 0 ? await throttle('history-start', LIMITS.historyStart) : null) ?? await throttle('history-pages', LIMITS.historyPages)
  if (limited) return limited
  try {
    return NextResponse.json({ ok: true, page, ...(await syncHistoryPage(src, page, 50)) })
  } catch (err) {
    return sourceErrorResponse(err, 'sources/history')
  }
})
