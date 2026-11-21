import { NextResponse } from 'next/server'
import { billingEnabled, paddleEnv, priceIds, PRICE_LABEL } from '@/lib/billing/config'
import { currentEntitlements, ensureSubscription } from '@/lib/billing/access'
import { toClient } from '@/lib/billing/entitlements'
import { signCheckoutUser } from '@/lib/billing/paddle'
import { cancellationInfo, type StoredCancellation } from '@/lib/billing/cancel-form'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface BillingInfo {
  billing: boolean
  entitlements: ReturnType<typeof toClient>
  subscription: { status: string; tier: string | null; interval: string | null; trialEndsAt: number | null; periodEnd: number | null; cancelAtPeriodEnd: boolean; paddle: boolean } | null
  checkout: { env: 'sandbox' | 'production'; clientToken: string | null; prices: { tier: 'plus'; interval: 'month' | 'year'; priceId: string; label: string }[] } | null
  userId: string
  userSig: string | null            // the server's signature over userId, sent along as checkout custom data
  cancellation: Pick<StoredCancellation, 'at' | 'endsAt' | 'viaForm'> | null      // the cancellation on record (not taken back)
  heldRequests: { at: number; kind: 'ordentlich' | 'ausserordentlich' }[]          // form requests held after a take-back
}

// Settings → Abo: status, dates and what the browser needs for Paddle.js (client token and price ids are public).
export const GET = withUser(async () => {
  const { uid } = await import('@/lib/db/owned')
  const e = toClient(await currentEntitlements())
  if (!billingEnabled()) return NextResponse.json({ billing: false, entitlements: e, subscription: null, checkout: null, userId: uid(), userSig: null, cancellation: null, heldRequests: [] } satisfies BillingInfo)
  const [row, { cancellation, held }] = await Promise.all([ensureSubscription(), cancellationInfo()])
  const ids = priceIds()
  // Plus is the only paid plan: one price per interval, as far as configured.
  const prices = (['month', 'year'] as const)
    .flatMap((interval) => (ids.plus[interval] ? [{ tier: 'plus' as const, interval, priceId: ids.plus[interval]!, label: PRICE_LABEL.plus[interval] }] : []))
  return NextResponse.json({
    billing: true,
    entitlements: e,
    subscription: row && {
      status: row.status, tier: row.tier, interval: row.interval, trialEndsAt: row.trialEndsAt, periodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd, paddle: !!row.paddleSubscriptionId,
    },
    checkout: { env: paddleEnv(), clientToken: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || null, prices },
    userId: uid(),
    userSig: signCheckoutUser(uid()),
    cancellation: cancellation && { at: cancellation.at, endsAt: cancellation.endsAt, viaForm: !!cancellation.viaForm },
    heldRequests: held,
  } satisfies BillingInfo)
})
