// Paddle webhook events → the user's subscription row (Phase 4). `applyPaddleEvent` is pure (the state transitions);
// `handlePaddleEvent` resolves the user, skips events already processed (billing_events, by Paddle's event id) and
// saves. Paddle may deliver late, twice or out of order: duplicates are skipped and older events never overwrite newer.
import { eq, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { billingEvents, subscription } from '@/lib/db/schema'
import { deletedUsers } from '@/lib/db/public-schema'
import { mine, own } from '@/lib/db/owned'
import { runAsUser } from '@/lib/server/scope'
import { priceIds, priceInfo, type PriceIds } from './config'
import { verifyCheckoutUser, type PaddleSubscription } from './paddle'
import type { SubscriptionRow } from './access'

export interface PaddleEvent {
  event_id: string
  event_type: string
  occurred_at: string
  data: Record<string, unknown>
}

// Retention stamps (Phase 5) and the checkout lock (12-05) are not Paddle's business: lib/billing/access.ts, the
// retention cron and lib/billing/checkout.ts write them.
export type SubState = Omit<SubscriptionRow, 'userId' | 'updatedAt' | 'lastSeenAt' | 'noticeSentAt' | 'checkoutStartedAt'>

export function subState(r: SubscriptionRow): SubState {
  const { userId: _u, updatedAt: _t, lastSeenAt: _s, noticeSentAt: _n, checkoutStartedAt: _c, ...row } = r
  return row
}

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
  priceId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, eventAt: null, otherSubscriptionIds: null,
}

const live = (row: SubState | null): row is SubState => !!row?.paddleSubscriptionId && row.status !== 'canceled'
const ending = (s: PaddleSubscription) => s.status === 'canceled' || s.scheduled_change?.action === 'cancel'

// An event for a subscription that is not the stored live one (12-05, finding 7: a second checkout went through).
// It never replaces the row; a live one is kept in `otherSubscriptionIds` (so cancel and deletion stop it too), an
// ended or cancel-scheduled one is dropped from there. null = nothing to change.
export function otherSubscription(row: SubState, s: PaddleSubscription): SubState | null {
  const others = row.otherSubscriptionIds ?? []
  const has = others.includes(s.id)
  if (ending(s)) return has ? { ...row, otherSubscriptionIds: others.filter((x) => x !== s.id) } : null
  return has ? null : { ...row, otherSubscriptionIds: [...others, s.id] }
}

// True when the event is about a second subscription next to the stored live one (logged by the caller).
export function isOtherSubscription(row: SubState | null, ev: PaddleEvent): boolean {
  const id = (ev.data as { id?: unknown }).id
  return SUBSCRIPTION_EVENTS.has(ev.event_type) && live(row) && typeof id === 'string' && id !== row.paddleSubscriptionId
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
    otherSubscriptionIds: row?.otherSubscriptionIds?.filter((x) => x !== s.id) ?? null,
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
    if (row && isOtherSubscription(row, ev)) return otherSubscription(row, ev.data as unknown as PaddleSubscription)
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

// The Runmate user an event belongs to: custom_data.userId from the checkout when the server signed it (the browser
// sets custom data, so an unsigned id is not trusted), else the stored Paddle ids.
async function userOf(ev: PaddleEvent): Promise<string | null> {
  const d = ev.data as { id?: string; subscription_id?: string; customer_id?: string; custom_data?: { userId?: unknown; userSig?: unknown } | null }
  const claimed = d.custom_data?.userId
  if (typeof claimed === 'string' && /^[\w-]{1,100}$/.test(claimed) && verifyCheckoutUser(claimed, d.custom_data?.userSig)) return claimed
  const subId = ev.event_type.startsWith('subscription.') ? d.id : d.subscription_id
  if (!subId && !d.customer_id) return null
  const conds = [subId ? eq(subscription.paddleSubscriptionId, subId) : undefined, d.customer_id ? eq(subscription.paddleCustomerId, d.customer_id) : undefined].filter(Boolean)
  // cross-user: the webhook has no session; Paddle's ids name the user
  const [row] = await db.select({ userId: subscription.userId }).from(subscription).where(or(...conds)).limit(1)
  return row?.userId ?? null
}

export type WebhookResult = 'applied' | 'unchanged' | 'duplicate' | 'ignored' | 'unknown-user' | 'deleted-user'

// A deleted account (Phase 5 tombstone): its events are dropped without writing anything for that user id.
async function isDeleted(userId: string): Promise<boolean> {
  // cross-user: the webhook has no session; the tombstone is looked up by the id the event names
  const [row] = await db.select({ id: deletedUsers.userId }).from(deletedUsers).where(eq(deletedUsers.userId, userId)).limit(1)
  return !!row
}

export async function handlePaddleEvent(ev: PaddleEvent): Promise<WebhookResult> {
  if (!HANDLED_EVENTS.has(ev.event_type)) return 'ignored'
  // cross-user: idempotency is per Paddle event, before the user is known
  const [seen] = await db.select({ id: billingEvents.eventId }).from(billingEvents).where(eq(billingEvents.eventId, ev.event_id)).limit(1)
  if (seen) return 'duplicate'
  const userId = await userOf(ev)
  if (!userId) return 'unknown-user'
  if (await isDeleted(userId)) return 'deleted-user'
  return runAsUser(userId, async () => {
    const [current] = await db.select().from(subscription).where(own(subscription)).limit(1)
    const row = current ? subState(current) : null
    if (isOtherSubscription(row, ev)) {
      console.error('[billing/webhook] second subscription for user=%s: stored=%s event=%s (%s, %s)', userId, row!.paddleSubscriptionId, (ev.data as { id?: string }).id, ev.event_type, ev.event_id)
    }
    const next = applyPaddleEvent(row, ev)
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
  const row = subState(current)
  const next = fromPaddleSubscription(row, s, row.eventAt)
  if (!next) return null
  const values = { ...next, updatedAt: Math.floor(Date.now() / 1000) }
  await db.update(subscription).set(values).where(own(subscription))
  return next
}
