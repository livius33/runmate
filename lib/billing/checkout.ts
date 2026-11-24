// The checkout guard (12-05, finding 7). Paddle.js runs in the browser, so the server's part is the signed user id the
// checkout carries (lib/billing/paddle.ts signCheckoutUser): it is handed out only by POST /api/billing/checkout, and
// only while the account has no live subscription and no checkout was handed out in the last 15 minutes. The lock is
// one conditional UPDATE, so two tabs clicking at once get one checkout between them.
import { eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { subscription } from '@/lib/db/schema'
import { own, uid } from '@/lib/db/owned'
import { ensureSubscription, nowS, type SubscriptionRow } from './access'
import { signCheckoutUser } from './paddle'
import { billingReady } from './config'

export const CHECKOUT_LOCK_S = 15 * 60

export type CheckoutBlock = 'live' | 'pending'

// Why no checkout may be opened now (null = it may). Pure; the UPDATE in claimCheckout says the same in SQL.
export function checkoutBlock(row: Pick<SubscriptionRow, 'status' | 'paddleSubscriptionId' | 'otherSubscriptionIds' | 'checkoutStartedAt'> | null, now: number): CheckoutBlock | null {
  if (!row) return null
  if ((row.paddleSubscriptionId && row.status !== 'canceled') || (row.otherSubscriptionIds?.length ?? 0) > 0) return 'live'
  if (row.checkoutStartedAt != null && now - row.checkoutStartedAt < CHECKOUT_LOCK_S) return 'pending'
  return null
}

export type CheckoutGrant = { ok: true; userId: string; userSig: string } | { ok: false; block: CheckoutBlock | 'not-configured' }

export async function claimCheckout(now = nowS()): Promise<CheckoutGrant> {
  if (!billingReady()) return { ok: false, block: 'not-configured' }
  const row = await ensureSubscription()
  const block = checkoutBlock(row, now)
  if (block) return { ok: false, block }
  const userSig = signCheckoutUser(uid())
  if (!userSig) return { ok: false, block: 'not-configured' }
  const won = await db.update(subscription).set({ checkoutStartedAt: now }).where(own(subscription,
    or(isNull(subscription.paddleSubscriptionId), eq(subscription.status, 'canceled')),
    sql`coalesce(cardinality(${subscription.otherSubscriptionIds}), 0) = 0`,
    or(isNull(subscription.checkoutStartedAt), lt(subscription.checkoutStartedAt, now - CHECKOUT_LOCK_S)),
  )).returning({ userId: subscription.userId })
  if (!won.length) return { ok: false, block: 'pending' }        // another request took it between the read and here
  return { ok: true, userId: uid(), userSig }
}
