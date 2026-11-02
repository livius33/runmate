import { NextResponse } from 'next/server'
import { billingEnabled } from '@/lib/billing/config'
import { verifyPaddleSignature } from '@/lib/billing/paddle'
import { handlePaddleEvent, type PaddleEvent } from '@/lib/billing/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Paddle → Runmate (public in middleware.ts; no session). The raw body is verified against `Paddle-Signature` with
// PADDLE_WEBHOOK_SECRET before anything is parsed or stored. Unknown users and event types are acknowledged (200) so
// Paddle stops retrying; only a failure to save answers 500 (Paddle retries).
export async function POST(req: Request) {
  if (!billingEnabled()) return new NextResponse('Not found', { status: 404 })
  const raw = await req.text()
  if (!verifyPaddleSignature(raw, req.headers.get('paddle-signature'), process.env.PADDLE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  let ev: PaddleEvent
  try {
    ev = JSON.parse(raw)
    if (typeof ev?.event_id !== 'string' || typeof ev.event_type !== 'string' || typeof ev.data !== 'object' || !ev.data) throw new Error('shape')
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  try {
    const result = await handlePaddleEvent(ev)
    if (result === 'unknown-user') console.warn('[billing/webhook] event without a known user:', ev.event_type, ev.event_id)
    return NextResponse.json({ ok: true, result })
  } catch (err: any) {
    console.error('[billing/webhook] failed:', ev.event_type, ev.event_id, err?.message)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
