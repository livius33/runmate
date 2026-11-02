import { NextResponse } from 'next/server'
import { z } from 'zod'
import { billingEnabled } from '@/lib/billing/config'
import { cancelCurrent } from '@/lib/billing/cancel'
import { setSettingJson } from '@/lib/db/settings'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const CancelBody = z.object({ kind: z.enum(['ordentlich', 'ausserordentlich']).default('ordentlich'), reason: z.string().trim().max(1000).optional() })

// "Jetzt kündigen" (§312k BGB) for the signed-in user: Paddle cancels at the end of the paid period. The request
// itself (kind, reason, time) is kept in the user's settings, so an extraordinary cancellation can be reviewed and is
// part of the data export.
export const POST = withUser(async (req: Request) => {
  if (!billingEnabled()) return NextResponse.json({ error: 'Kein Abo auf dieser Installation.' }, { status: 404 })
  const parsed = CancelBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
  const r = await cancelCurrent('next_billing_period')
  if (!r.ok) return NextResponse.json(r, { status: 502 })
  await setSettingJson('billing_cancellation', { ...parsed.data, at: r.at, endsAt: 'endsAt' in r ? r.endsAt : null })
  return NextResponse.json({ ...r, cancellation: parsed.data.kind })
})
