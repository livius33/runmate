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
// retention cron and lib/billing/checkout.ts write them. `version` is the compare-and-set counter (updateSubscription).
export type SubState = Omit<SubscriptionRow, 'userId' | 'updatedAt' | 'lastSeenAt' | 'noticeSentAt' | 'checkoutStartedAt' | 'version'>

export function subState(r: SubscriptionRow): SubState {
  const { userId: _u, updatedAt: _t, lastSeenAt: _s, noticeSentAt: _n, checkoutStartedAt: _c, version: _v, ...row } = r
  return row
}

// Read-modify-write of the current user's Paddle state without a lock (12-05, finding 11): two webhooks, a webhook and
// a cancel, or the reconcile job may run at once, and neon-http has no interactive transactions. Each write is one
// statement that only lands if `version` is still the one read (or, for a new row, if none exists yet); otherwise the
// row is read again and `change` decides anew. Returns the row written, or null when `change` had nothing to do.
const CAS_TRIES = 5
export class ConcurrentUpdateError extends Error {
  constructor() { super('subscription row kept changing') }
}

export async function updateSubscription(change: (row: SubState | null) => SubState | null): Promise<SubState | null> {
  for (let i = 0; i < CAS_TRIES; i++) {
    const [current] = await db.select().from(subscription).where(own(subscription)).limit(1)
    const next = change(current ? subState(current) : null)
    if (!next) return null
    const updatedAt = Math.floor(Date.now() / 1000)
    const won = current
      ? await db.update(subscription).set({ ...next, updatedAt, version: current.version + 1 })
        .where(own(subscription, eq(subscription.version, current.version))).returning({ userId: subscription.userId })
      : await db.insert(subscription).values(mine({ ...next, updatedAt })).onConflictDoNothing().returning({ userId: subscription.userId })
    if (won.length) return next
  }
  throw new ConcurrentUpdateError()
}

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.created', 'subscription.updated', 'subscription.activated', 'subscription.canceled',
  'subscription.past_due', 'subscription.paused', 'subscription.resumed', 'subscription.trialing',
])
export const HANDLED_EVENTS = new Set([...SUBSCRIPTION_EVENTS, 'transaction.completed'])

export const secs = (iso: unknown): number | null => {
  if (typeof iso !== 'string') return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.floor(t / 1000)
}

const EMPTY: SubState = {
  status: 'trialing', tier: null, interval: null, trialEndsAt: null, paddleCustomerId: null, paddleSubscriptionId: null,
  priceId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, eventAt: null, otherSubscriptionIds: null,
  otherSubscriptionSeen: null,
}

const live = (row: SubState | null): row is SubState => !!row?.paddleSubscriptionId && row.status !== 'canceled'
export const ending = (s: PaddleSubscription) => s.status === 'canceled' || s.scheduled_change?.action === 'cancel'

// True when `at` is older than the last event seen for that (non-stored) subscription id.
const staleOther = (row: SubState, id: string, at: number | null) => {
  const last = row.otherSubscriptionSeen?.[id]
  return at != null && last != null && at < last
}
// The seen-map with `id` stamped at `at` (never moved back).
export const stampSeen = (seen: Record<string, number> | null, id: string, at: number | null): Record<string, number> | null =>
  at == null || (seen?.[id] ?? -Infinity) >= at ? seen : { ...(seen ?? {}), [id]: at }

// An event for a subscription that is not the stored live one (12-05, finding 7: a second checkout went through).
// It never replaces the row; a live one is kept in `otherSubscriptionIds` (so cancel and deletion stop it too), an
// ended or cancel-scheduled one is dropped from there. An event older than the last one seen for that id is ignored.
// null = nothing to change.
export function otherSubscription(row: SubState, s: PaddleSubscription, at: number | null = null): SubState | null {
  if (staleOther(row, s.id, at)) return null
  const others = row.otherSubscriptionIds ?? []
  const has = others.includes(s.id)
  const list = ending(s) ? (has ? others.filter((x) => x !== s.id) : others) : (has ? others : [...others, s.id])
  const seen = stampSeen(row.otherSubscriptionSeen, s.id, at)
  if (list === others && seen === row.otherSubscriptionSeen) return null
  return { ...row, otherSubscriptionIds: list, otherSubscriptionSeen: seen }
}

// A different subscription becomes the stored one (the stored one ended). The one it replaces is remembered with its
// last event time, so its own late events count as stale.
export function replaceStored(row: SubState, s: PaddleSubscription, at: number | null, ids: PriceIds = priceIds()): SubState | null {
  const next = fromPaddleSubscription(row, s, at, ids)
  if (!next) return null
  const { [s.id]: _dropped, ...seen } = stampSeen(row.otherSubscriptionSeen, row.paddleSubscriptionId!, row.eventAt) ?? {}
  return { ...next, otherSubscriptionSeen: Object.keys(seen).length ? seen : null }
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
    const s = ev.data as unknown as PaddleSubscription
    if (row && isOtherSubscription(row, ev)) return otherSubscription(row, s, at)
    // The stored subscription has ended and this is another one: its time is not comparable with the stored one's
    // (review 4: a delayed created event for B must not be dropped because A's cancel came first). A live one takes
    // over; an ended one is only noted.
    if (row?.paddleSubscriptionId && s.id !== row.paddleSubscriptionId) {
      if (staleOther(row, s.id, at)) return null
      return s.status === 'canceled' ? otherSubscription(row, s, at) : replaceStored(row, s, at, ids)
    }
    if (row?.eventAt != null && at != null && at < row.eventAt) return null          // stale: a newer event of this subscription
    return fromPaddleSubscription(row, s, at, ids)
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
    let second: string | null = null
    const next = await updateSubscription((row) => {
      second = isOtherSubscription(row, ev) ? row!.paddleSubscriptionId : null
      return applyPaddleEvent(row, ev)
    })
    if (second) {
      console.error('[billing/webhook] second subscription for user=%s: stored=%s event=%s (%s, %s)', userId, second, (ev.data as { id?: string }).id, ev.event_type, ev.event_id)
    }
    // Recorded after applying: a crash in between means Paddle's retry applies it again (same event, same result).
    await db.insert(billingEvents).values(mine({ eventId: ev.event_id, type: ev.event_type, occurredAt: secs(ev.occurred_at) })).onConflictDoNothing()
    return next ? 'applied' : 'unchanged'
  }, { profile: null })
}

// The row after Runmate itself cancelled at Paddle (the response is the updated subscription entity).
export function saveCancelled(s: PaddleSubscription) {
  return updateSubscription((row) => (row ? fromPaddleSubscription(row, s, row.eventAt) : null))
}
