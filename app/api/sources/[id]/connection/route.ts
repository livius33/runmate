import { NextResponse } from 'next/server'
import { source } from '@/lib/sources/registry'
import { sourceErrorResponse } from '@/lib/sources/http'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const maxDuration = 30

type Ctx = { params: Promise<{ id: string }> }

// Connect: the source's own input (Garmin login: { username, password, consent: true }; it logs in before anything is
// stored). The response is the source status only; the request body is never logged.
export const PUT = withUser(async (req: Request, { params }: Ctx) => {
  const src = source((await params).id)
  if (!src?.meta.available || !src.connect) return NextResponse.json({ error: 'Unbekannte Quelle' }, { status: 404 })
  try {
    return NextResponse.json({ ok: true, status: await src.connect(await req.json().catch(() => null)) })
  } catch (err) {
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
