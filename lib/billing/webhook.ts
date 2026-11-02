// Paddle webhook events → the user's subscription row (Phase 4). `applyPaddleEvent` is pure (the state transitions);
// `handlePaddleEvent` resolves the user, skips events already processed (billing_events, by Paddle's event id) and
// saves. Paddle may deliver late, twice or out of order: duplicates are skipped and older events never overwrite newer.
import { eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingEvents, subscription } from '@/lib/db/schema'
import { mine, own } from '@/lib/db/owned'
import { runAsUser } from '@/lib/server/scope'
import { priceIds, priceInfo, type PriceIds } from './config'
import type { PaddleSubscription } from './paddle'
import type { SubscriptionRow } from './access'

export interface PaddleEvent {
  event_id: string
  event_type: string
  occurred_at: string
  data: Record<string, unknown>
}

export type SubState = Omit<SubscriptionRow, 'userId' | 'updatedAt'>

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.created', 'subscription.updated', 'subscription.activated', 'subscription.canceled',
  'subscription.past_due', 'subscription.paused', 'subscription.resumed', 'subscription.trialing',
])
export const HANDLED_EVENTS = new Set([...SUBSCRIPTION_EVENTS, 'transaction.completed'])

const secs = (iso: unknown): number | null => {
  if (typeof iso !== 'string') return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.floor(t / 1000)
}

const EMPTY: SubState = {
  status: 'trialing', tier: null, interval: null, trialEndsAt: null, paddleCustomerId: null, paddleSubscriptionId: null,
  priceId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, eventAt: null,
}

// The row after a subscription entity (from a webhook or from a cancel call). Unknown price → null (not ours).
export function fromPaddleSubscription(row: SubState | null, s: PaddleSubscription, eventAt: number | null, ids: PriceIds = priceIds()): SubState | null {
  const priceId = s.items?.[0]?.price?.id ?? null
  const plan = priceInfo(priceId, ids)
  if (!plan) return null
  return {
    ...(row ?? EMPTY),
    status: s.status,
    tier: plan.tier,
    interval: plan.interval,
    paddleCustomerId: s.customer_id ?? row?.paddleCustomerId ?? null,
    paddleSubscriptionId: s.id,
    priceId,
    currentPeriodEnd: secs(s.current_billing_period?.ends_at) ?? row?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: s.scheduled_change?.action === 'cancel',
    canceledAt: secs(s.canceled_at) ?? (s.status === 'canceled' ? eventAt : null),
    eventAt: eventAt ?? row?.eventAt ?? null,
  }
}

// One event applied to the current row. Returns the next row, or `null` = nothing to change.
export function applyPaddleEvent(row: SubState | null, ev: PaddleEvent, ids: PriceIds = priceIds()): SubState | null {
  const at = secs(ev.occurred_at)
  if (SUBSCRIPTION_EVENTS.has(ev.event_type)) {
    if (row?.eventAt != null && at != null && at < row.eventAt) return null          // stale: a newer event already applied
    return fromPaddleSubscription(row, ev.data as unknown as PaddleSubscription, at, ids)
  }
  if (ev.event_type === 'transaction.completed') {
    // The first payment: links customer and subscription; marks the plan active only if no subscription event did yet.
    const d = ev.data as { customer_id?: string; subscription_id?: string; items?: { price?: { id?: string } }[] }
    if (!d.subscription_id) return null                                                // a one-off transaction
    const priceId = d.items?.[0]?.price?.id ?? null
    const plan = priceInfo(priceId, ids)
    const base = row ?? EMPTY
    if (base.paddleSubscriptionId) {
      return base.paddleSubscriptionId === d.subscription_id && !base.paddleCustomerId && d.customer_id ? { ...base, paddleCustomerId: d.customer_id } : null
    }
    if (!plan) return null
    return { ...base, status: 'active', tier: plan.tier, interval: plan.interval, priceId, paddleSubscriptionId: d.subscription_id, paddleCustomerId: d.customer_id ?? null }
  }
  return null
}

// The Runmate user an event belongs to: custom_data.userId from the checkout, else the stored Paddle ids.
async function userOf(ev: PaddleEvent): Promise<string | null> {
  const d = ev.data as { id?: string; subscription_id?: string; customer_id?: string; custom_data?: { userId?: unknown } | null }
  const claimed = d.custom_data?.userId
  if (typeof claimed === 'string' && /^[\w-]{1,100}$/.test(claimed)) return claimed
  const subId = ev.event_type.startsWith('subscription.') ? d.id : d.subscription_id
  if (!subId && !d.customer_id) return null
  const conds = [subId ? eq(subscription.paddleSubscriptionId, subId) : undefined, d.customer_id ? eq(subscription.paddleCustomerId, d.customer_id) : undefined].filter(Boolean)
  // cross-user: the webhook has no session; Paddle's ids name the user
  const [row] = await db.select({ userId: subscription.userId }).from(subscription).where(or(...conds)).limit(1)
  return row?.userId ?? null
}

export type WebhookResult = 'applied' | 'unchanged' | 'duplicate' | 'ignored' | 'unknown-user'

export async function handlePaddleEvent(ev: PaddleEvent): Promise<WebhookResult> {
  if (!HANDLED_EVENTS.has(ev.event_type)) return 'ignored'
  // cross-user: idempotency is per Paddle event, before the user is known
  const [seen] = await db.select({ id: billingEvents.eventId }).from(billingEvents).where(eq(billingEvents.eventId, ev.event_id)).limit(1)
  if (seen) return 'duplicate'
  const userId = await userOf(ev)
  if (!userId) return 'unknown-user'
  return runAsUser(userId, async () => {
    const [current] = await db.select().from(subscription).where(own(subscription)).limit(1)
    const { userId: _u, updatedAt: _t, ...row } = current ?? ({} as SubscriptionRow)
    const next = applyPaddleEvent(current ? row : null, ev)
    if (next) {
      const values = { ...next, updatedAt: Math.floor(Date.now() / 1000) }
      await db.insert(subscription).values(mine(values)).onConflictDoUpdate({ target: subscription.userId, set: values })
    }
    // Recorded after applying: a crash in between means Paddle's retry applies it again (same event, same result).
    await db.insert(billingEvents).values(mine({ eventId: ev.event_id, type: ev.event_type, occurredAt: secs(ev.occurred_at) })).onConflictDoNothing()
    return next ? 'applied' : 'unchanged'
  }, { profile: null })
}

// The row after Runmate itself cancelled at Paddle (the response is the updated subscription entity).
export async function saveCancelled(s: PaddleSubscription) {
  const [current] = await db.select().from(subscription).where(own(subscription)).limit(1)
  if (!current) return null
  const { userId: _u, updatedAt: _t, ...row } = current
  const next = fromPaddleSubscription(row, s, row.eventAt)
  if (!next) return null
  const values = { ...next, updatedAt: Math.floor(Date.now() / 1000) }
  await db.update(subscription).set(values).where(own(subscription))
  return next
}
