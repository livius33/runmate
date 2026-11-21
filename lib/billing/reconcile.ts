// Daily reconciliation with Paddle (12-05, finding 9). Webhooks can be lost (secret rotated, endpoint down longer than
// Paddle retries), so once a day every subscription row that is not final is compared with what Paddle has and the
// difference applied: status, period, the cancel flag, second subscriptions that ended, and a second subscription
// taking over when the stored one ended. Tombstones that still name a Paddle subscription (a deletion whose cancel
// failed, lib/account/delete.ts) are cancelled. `reconcileState` is pure; the cron route is
// app/api/cron/billing-reconcile.
import { and, asc, eq, gt, isNotNull, lt, ne, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { subscription } from '@/lib/db/schema'
import { deletedUsers, jobState } from '@/lib/db/public-schema'
import { runAsUser } from '@/lib/server/scope'
import { priceIds, type PriceIds } from './config'
import { cancelSubscription, getSubscription, type PaddleSubscription } from './paddle'
import { ending, fromPaddleSubscription, replaceStored, secs, stampSeen, subState, updateSubscription, type SubState } from './webhook'
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
    if (s && ending(s)) next = { ...next, otherSubscriptionIds: (next.otherSubscriptionIds ?? []).filter((x) => x !== id), otherSubscriptionSeen: stampSeen(next.otherSubscriptionSeen, id, secs(s.updated_at)) }
  }
  // The stored subscription ended while a second one runs: the second one is what the account pays for now.
  if (next.status === 'canceled') {
    const runner = (next.otherSubscriptionIds ?? []).map((id) => others[id]).find((s) => s && !ending(s))
    if (runner) next = replaceStored(next, runner, secs(runner.updated_at) ?? next.eventAt, ids) ?? next
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
  // Compared again inside the compare-and-set: a webhook that landed meanwhile wins (its eventAt is newer).
  const next = reconcileState(state, main, others) && await runAsUser(row.userId, () => updateSubscription((r) => (r ? reconcileState(r, main, others) : null)), { profile: null })
  if (!next) return false
  console.info('[billing/reconcile] user=%s subscription=%s applied: status %s→%s, cancel %s→%s, others %s→%s', row.userId, row.paddleSubscriptionId ?? '-',
    row.status, next.status, row.cancelAtPeriodEnd, next.cancelAtPeriodEnd, (row.otherSubscriptionIds ?? []).join(',') || '-', (next.otherSubscriptionIds ?? []).join(',') || '-')
  return true
}

// A tombstone's leftover subscriptions: cancelled at once unless Paddle already ended them.
async function settleTombstone(t: { userId: string; paddleSubscriptionIds: string[] | null }): Promise<number> {
  let cancelled = 0
  for (const id of t.paddleSubscriptionIds ?? []) {
    try {
      const s = await getSubscription(id)
      if (s.status !== 'canceled') await cancelSubscription(id, 'immediately')
      cancelled++
      // Removed one by one in SQL: an id the webhook appends meanwhile stays.
      await db.update(deletedUsers).set({ paddleSubscriptionIds: sql`nullif(array_remove(${deletedUsers.paddleSubscriptionIds}, ${id}::text), '{}'::text[])` })
        .where(eq(deletedUsers.userId, t.userId))
    } catch (err: any) {
      console.error('[billing/reconcile] deleted user=%s subscription=%s still running: %s', t.userId, id, err?.message)
    }
  }
  return cancelled
}

export const CURSOR_JOB = 'billing-reconcile.cursor'

async function readCursor(): Promise<string> {
  const [row] = await db.select({ value: jobState.value }).from(jobState).where(eq(jobState.name, CURSOR_JOB)).limit(1)
  return row?.value ?? ''
}
async function saveCursor(value: string) {
  const updatedAt = Math.floor(Date.now() / 1000)
  await db.insert(jobState).values({ name: CURSOR_JOB, value, updatedAt }).onConflictDoUpdate({ target: jobState.name, set: { value, updatedAt } })
}

// One run until done or `deadline` (ms epoch). Tombstones first (few, and each is money still being taken). Then the
// subscription rows by user id (keyset, RECONCILE_PAGE at a time), starting after the user the last run stopped at
// (job_state) and wrapping around to the start; a full lap resets the cursor. `complete: false` = the budget ran out
// and the next run continues from the cursor.
export async function reconcileAll(deadline: number): Promise<ReconcileReport> {
  const r: ReconcileReport = { rows: 0, changed: 0, failed: 0, tombstones: 0, cancelled: 0, complete: false }
  const tombs = await db.select({ userId: deletedUsers.userId, paddleSubscriptionIds: deletedUsers.paddleSubscriptionIds }).from(deletedUsers)
    .where(sql`coalesce(cardinality(${deletedUsers.paddleSubscriptionIds}), 0) > 0`)
  for (const t of tombs) {
    if (Date.now() > deadline) return r
    r.tombstones++
    r.cancelled += await settleTombstone(t)
  }

  const nonFinal = or(
    and(isNotNull(subscription.paddleSubscriptionId), ne(subscription.status, 'canceled')),
    sql`coalesce(cardinality(${subscription.otherSubscriptionIds}), 0) > 0`,
  )
  const start = await readCursor()
  let wrapped = start === ''            // no cursor: one pass from the first id is the whole lap
  let after = start
  let last = start
  for (;;) {
    const upTo = wrapped && start ? lt(subscription.userId, start) : undefined
    // cross-user: the cron has no session; it reads the non-final rows page by page and writes inside each user's scope
    const page = await db.select().from(subscription).where(and(nonFinal, gt(subscription.userId, after), upTo)).orderBy(asc(subscription.userId)).limit(RECONCILE_PAGE)
    for (const row of page) {
      if (Date.now() > deadline) { await saveCursor(last); return r }
      r.rows++
      try {
        if (await reconcileRow(row)) r.changed++
      } catch (err: any) {
        r.failed++
        console.error('[billing/reconcile] user=%s subscription=%s failed: %s', row.userId, row.paddleSubscriptionId ?? '-', err?.message)
      }
      last = row.userId
    }
    if (page.length === RECONCILE_PAGE) { after = page[page.length - 1].userId; continue }
    if (wrapped) break
    wrapped = true
    after = ''
  }
  await saveCursor('')
  r.complete = true
  return r
}
