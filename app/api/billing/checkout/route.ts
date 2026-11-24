import { NextResponse } from 'next/server'
import { billingEnabled } from '@/lib/billing/config'
import { claimCheckout } from '@/lib/billing/checkout'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'

const BLOCKED: Record<string, string> = {
  live: 'Du hast schon ein laufendes Abo. Tarif und Zahlungsart änderst du im Kundenportal.',
  pending: 'Ein Kauf wurde gerade begonnen. Ist er abgeschlossen, erscheint dein Abo in wenigen Sekunden; sonst kannst du es in einer Viertelstunde noch einmal versuchen.',
  'not-configured': 'Die Zahlung ist auf dieser Installation noch nicht eingerichtet.',
}

// The click on a Plus price (12-05): the signed user id for the checkout's custom data, or 409 while a subscription is
// live or a checkout was started in the last 15 minutes (lib/billing/checkout.ts).
export const POST = withUser(async () => {
  if (!billingEnabled()) return NextResponse.json({ error: 'Kein Abo auf dieser Installation.' }, { status: 404 })
  const r = await claimCheckout()
  if (!r.ok) return NextResponse.json({ error: BLOCKED[r.block], block: r.block }, { status: 409 })
  return NextResponse.json({ userId: r.userId, userSig: r.userSig })
})
