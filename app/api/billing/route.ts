import { NextResponse } from 'next/server'
import { billingEnabled, paddleEnv, priceIds, PRICE_LABEL } from '@/lib/billing/config'
import { currentEntitlements, ensureSubscription } from '@/lib/billing/access'
import { toClient } from '@/lib/billing/entitlements'
import { withUser } from '@/lib/server/scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface BillingInfo {
  billing: boolean
  entitlements: ReturnType<typeof toClient>
  subscription: { status: string; tier: string | null; interval: string | null; trialEndsAt: number | null; periodEnd: number | null; cancelAtPeriodEnd: boolean; paddle: boolean } | null
  checkout: { env: 'sandbox' | 'production'; clientToken: string | null; prices: { tier: 'basic' | 'plus'; interval: 'month' | 'year'; priceId: string; label: string }[] } | null
  userId: string
}

// Settings → Abo: status, dates and what the browser needs for Paddle.js (client token and price ids are public).
export const GET = withUser(async () => {
  const { uid } = await import('@/lib/db/owned')
  const e = toClient(await currentEntitlements())
  if (!billingEnabled()) return NextResponse.json({ billing: false, entitlements: e, subscription: null, checkout: null, userId: uid() } satisfies BillingInfo)
  const row = await ensureSubscription()
  const ids = priceIds()
  const prices = (['basic', 'plus'] as const).flatMap((tier) => (['month', 'year'] as const)
    .flatMap((interval) => (ids[tier][interval] ? [{ tier, interval, priceId: ids[tier][interval]!, label: PRICE_LABEL[tier][interval] }] : [])))
  return NextResponse.json({
    billing: true,
    entitlements: e,
    subscription: row && {
      status: row.status, tier: row.tier, interval: row.interval, trialEndsAt: row.trialEndsAt, periodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd, paddle: !!row.paddleSubscriptionId,
    },
    checkout: { env: paddleEnv(), clientToken: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || null, prices },
    userId: uid(),
  } satisfies BillingInfo)
})
