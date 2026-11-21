// Daily reconciliation with Paddle (12-05, finding 9). Webhooks can be lost (secret rotated, endpoint down longer than
// Paddle retries), so once a day every subscription row that is not final is compared with what Paddle has and the
// difference applied: status, period, the cancel flag, second subscriptions that ended, and a second subscription
// taking over when the stored one ended. Tombstones that still name a Paddle subscription (a deletion whose cancel
// failed, lib/account/delete.ts) are cancelled. `reconcileState` is pure; the cron route is
// app/api/cron/billing-reconcile.
import { and, asc, eq, gt, isNotNull, ne, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { subscription } from '@/lib/db/schema'
import { deletedUsers } from '@/lib/db/public-schema'
import { own } from '@/lib/db/owned'
import { runAsUser } from '@/lib/server/scope'
import { priceIds, type PriceIds } from './config'
import { cancelSubscription, getSubscription, type PaddleSubscription } from './paddle'
import { ending, fromPaddleSubscription, secs, subState, type SubState } from './webhook'
import type { SubscriptionRow } from './access'

export const RECONCILE_PAGE = 100

const COMPARED: (keyof SubState)[] = ['status', 'tier', 'interval', 'paddleCustomerId', 'paddleSubscriptionId', 'priceId', 'currentPeriodEnd', 'cancelAtPeriodEnd', 'canceledAt', 'otherSubscriptionIds']
const same = (a: SubState, b: SubState) => COMPARED.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null))

// The row after comparing it with Paddle's entities (`main` for the stored id, `others` by id; a missing one was not
// fetched). null = nothing differs. A row changed by a webhook after Paddle's `updated_at` is left alone.
export function reconcileState(row: SubState, main: PaddleSubscription | null, others: Record<string, PaddleSubscription>, ids: PriceIds = priceIds()): SubState | null {
  let next = row
  if (main && main.id === row.paddleSubscriptionId) {
    const at = secs(main.updated_at)
    if (!(row.eventAt != null && at != null && at < row.eventAt)) next = fromPaddleSubscription(next, main, at ?? row.eventAt, ids) ?? next
  }
  for (const id of row.otherSubscriptionIds ?? []) {
    const s = others[id]
    if (s && ending(s)) next = { ...next, otherSubscriptionIds: (next.otherSubscriptionIds ?? []).filter((x) => x !== id) }
  }
  // The stored subscription ended while a second one runs: the second one is what the account pays for now.
  if (next.status === 'canceled') {
    const runner = (next.otherSubscriptionIds ?? []).map((id) => others[id]).find((s) => s && !ending(s))
    if (runner) next = fromPaddleSubscription(next, runner, secs(runner.updated_at) ?? next.eventAt, ids) ?? next
  }
  return same(row, next) ? null : next
}

export interface ReconcileReport { rows: number; changed: number; failed: number; tombstones: number; cancelled: number; complete: boolean }

async function reconcileRow(row: SubscriptionRow): Promise<boolean> {
  const state = subState(row)
  const mainLive = row.paddleSubscriptionId && row.status !== 'canceled'
  const main = mainLive ? await getSubscription(row.paddleSubscriptionId!) : null
  const others: Record<string, PaddleSubscription> = {}
  for (const id of row.otherSubscriptionIds ?? []) others[id] = await getSubscription(id)
  const next = reconcileState(state, main, others)
  if (!next) return false
  await runAsUser(row.userId, async () => {
    await db.update(subscription).set({ ...next, updatedAt: Math.floor(Date.now() / 1000) }).where(own(subscription))
  }, { profile: null })
  console.info('[billing/reconcile] user=%s subscription=%s applied: status %s→%s, cancel %s→%s, others %s→%s', row.userId, row.paddleSubscriptionId ?? '-',
    row.status, next.status, row.cancelAtPeriodEnd, next.cancelAtPeriodEnd, (row.otherSubscriptionIds ?? []).join(',') || '-', (next.otherSubscriptionIds ?? []).join(',') || '-')
  return true
}

// A tombstone's leftover subscriptions: cancelled at once unless Paddle already ended them.
async function settleTombstone(t: { userId: string; paddleSubscriptionIds: string[] | null }): Promise<number> {
  const left: string[] = []
  let cancelled = 0
  for (const id of t.paddleSubscriptionIds ?? []) {
    try {
      const s = await getSubscription(id)
      if (s.status !== 'canceled') await cancelSubscription(id, 'immediately')
      cancelled++
    } catch (err: any) {
      left.push(id)
      console.error('[billing/reconcile] deleted user=%s subscription=%s still running: %s', t.userId, id, err?.message)
    }
  }
  await db.update(deletedUsers).set({ paddleSubscriptionIds: left.length ? left : null }).where(eq(deletedUsers.userId, t.userId))
  return cancelled
}

// One run: pages through the rows by user id (keyset, RECONCILE_PAGE at a time) until done or `deadline` (ms epoch).
// What is left after the deadline is reported (`complete: false`); the next run starts again from the first user id.
export async function reconcileAll(deadline: number): Promise<ReconcileReport> {
  const r: ReconcileReport = { rows: 0, changed: 0, failed: 0, tombstones: 0, cancelled: 0, complete: false }
  const nonFinal = or(
    and(isNotNull(subscription.paddleSubscriptionId), ne(subscription.status, 'canceled')),
    sql`coalesce(cardinality(${subscription.otherSubscriptionIds}), 0) > 0`,
  )
  let after = ''
  for (;;) {
    // cross-user: the cron has no session; it reads the non-final rows page by page and writes inside each user's scope
    const page = await db.select().from(subscription).where(and(nonFinal, gt(subscription.userId, after))).orderBy(asc(subscription.userId)).limit(RECONCILE_PAGE)
    for (const row of page) {
      if (Date.now() > deadline) return r
      r.rows++
      try {
        if (await reconcileRow(row)) r.changed++
      } catch (err: any) {
        r.failed++
        console.error('[billing/reconcile] user=%s subscription=%s failed: %s', row.userId, row.paddleSubscriptionId ?? '-', err?.message)
      }
    }
    if (page.length < RECONCILE_PAGE) break
    after = page[page.length - 1].userId
  }
  const tombs = await db.select({ userId: deletedUsers.userId, paddleSubscriptionIds: deletedUsers.paddleSubscriptionIds }).from(deletedUsers)
    .where(sql`coalesce(cardinality(${deletedUsers.paddleSubscriptionIds}), 0) > 0`)
  for (const t of tombs) {
    if (Date.now() > deadline) return r
    r.tombstones++
    r.cancelled += await settleTombstone(t)
  }
  r.complete = true
  return r
}
