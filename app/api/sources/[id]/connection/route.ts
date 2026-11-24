import { NextResponse } from 'next/server'
import { source } from '@/lib/sources/registry'
import { sourceErrorResponse } from '@/lib/sources/http'
import { safeError } from '@/lib/sources/sync'
import { LIMITS, throttleHit, throttleReset, throttleWait, tooManyResponse } from '@/lib/server/throttle'
import { withUser } from '@/lib/server/scope'
import { intakeBlocked } from '@/lib/legal/intake'

export const runtime = 'nodejs'
export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }

// Connect: the source's own input (Garmin login: { username, password, consent: true }; it logs in before anything is
// stored). The response is the source status only; the request body is never logged.
// Failed attempts are limited per account (12-04): after five inside an hour the next is refused without contacting
// the source, so an account cannot test passwords from the server's address. A successful sign-in clears the count;
// a malformed request (no contact) does not count.
export const PUT = withUser(async (req: Request, { params }: Ctx) => {
  const blocked = await intakeBlocked()
  if (blocked) return blocked
  const src = source((await params).id)
  if (!src?.meta.available || !src.connect) return NextResponse.json({ error: 'Unbekannte Quelle' }, { status: 404 })
  const failures = `connect-failures:${src.meta.id}`
  const wait = await throttleWait(failures, LIMITS.connectFailures)
  if (wait) return tooManyResponse(wait)
  try {
    const status = await src.connect(await req.json().catch(() => null))
    await throttleReset(failures)
    return NextResponse.json({ ok: true, status })
  } catch (err) {
    if (safeError(err).code !== 'invalid') await throttleHit(failures, LIMITS.connectFailures)
    return sourceErrorResponse(err, 'sources/connect')
  }
})

// Disconnect: removes the stored login / link (synced activities stay).
export const DELETE = withUser(async (_req: Request, { params }: Ctx) => {
  const src = source((await params).id)
  if (!src?.meta.available) return NextResponse.json({ error: 'Unbekannte Quelle' }, { status: 404 })
  try {
    await src.disconnect()
    return NextResponse.json({ ok: true, status: await src.status() })
  } catch (err) {
    return sourceErrorResponse(err, 'sources/disconnect')
  }
})
