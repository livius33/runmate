import { NextResponse } from 'next/server'
import { billingEnabled } from '@/lib/billing/config'
import { undoCancellation } from '@/lib/billing/cancel-form'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// "Kündigung zurücknehmen" in Settings → Abo: the scheduled cancellation is removed at Paddle; afterwards the public
// form only holds requests for this account (lib/billing/cancel-form.ts).
export const POST = withUser(async () => {
  if (!billingEnabled()) return NextResponse.json({ error: 'Kein Abo auf dieser Installation.' }, { status: 404 })
  const r = await undoCancellation()
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r)
})
