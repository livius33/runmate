import { NextResponse } from 'next/server'
import { billingEnabled } from '@/lib/billing/config'
import { loadSubscription } from '@/lib/billing/access'
import { portalUrl } from '@/lib/billing/paddle'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

// A fresh Paddle customer-portal link (payment method, invoices, plan change) for the signed-in user.
export const POST = withUser(async () => {
  if (!billingEnabled()) return NextResponse.json({ error: 'Kein Abo auf dieser Installation.' }, { status: 404 })
  const row = await loadSubscription()
  if (!row?.paddleCustomerId) return NextResponse.json({ error: 'Noch kein bezahltes Abo – das Kundenportal gibt es nach dem ersten Kauf.' }, { status: 409 })
  try {
    return NextResponse.json({ url: await portalUrl(row.paddleCustomerId, [row.paddleSubscriptionId, ...(row.otherSubscriptionIds ?? [])].filter((x): x is string => !!x)) })
  } catch (err: any) {
    console.error('[billing/portal]', err?.message)
    return NextResponse.json({ error: 'Das Kundenportal ist gerade nicht erreichbar. Bitte später noch einmal.' }, { status: 502 })
  }
})
