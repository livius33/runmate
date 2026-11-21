// Account deletion (Art. 17 GDPR, Phase 4), one path for the Settings button and Clerk's user.deleted webhook:
// cancel the Paddle subscription at once, delete every row of the user, leave a tombstone (Phase 5: a late Paddle
// webhook must not recreate a row), then delete the Clerk user (unless Clerk already deleted it). Runs inside the
// user's scope.
// 12-05: Paddle is asked again when the cancellation fails; if it still fails, the subscription and customer ids are
// logged and kept with the tombstone, and the daily reconcile job (app/api/cron/billing-reconcile) cancels them later.
import { db } from '@/lib/db'
import { deletedUsers } from '@/lib/db/public-schema'
import { mine, uid } from '@/lib/db/owned'
import { billingEnabled } from '@/lib/billing/config'
import { loadSubscription } from '@/lib/billing/access'
import { cancelCurrent, type CancelResult } from '@/lib/billing/cancel'
import { deleteUserData } from './data'

export interface DeleteOptions {
  deleteClerkUser: boolean        // false when Clerk sent user.deleted
  strictBilling: boolean          // true: stop if Paddle cannot be reached (the user can retry); false: delete anyway, keep the ids
}

// Pauses between the attempts at Paddle (three in all).
export const CANCEL_RETRY_MS = [500, 2000]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function cancelWithRetry(): Promise<CancelResult> {
  let r = await cancelCurrent('immediately')
  for (const ms of CANCEL_RETRY_MS) {
    if (r.ok) break
    await sleep(ms)
    r = await cancelCurrent('immediately')
  }
  return r
}

export async function deleteAccount(opts: DeleteOptions): Promise<{ ok: true; tables: string[] } | { ok: false; error: string }> {
  const userId = uid()
  let unpaid: { paddleCustomerId: string | null; paddleSubscriptionIds: string[] } | null = null
  if (billingEnabled()) {
    const r = await cancelWithRetry()
    if (!r.ok) {
      if (opts.strictBilling) return { ok: false, error: 'Dein Abo konnte gerade nicht beendet werden, deshalb ist noch nichts gelöscht. Bitte versuche es gleich noch einmal.' }
      const row = await loadSubscription()
      unpaid = { paddleCustomerId: row?.paddleCustomerId ?? null, paddleSubscriptionIds: r.failed }
      console.error('[account/delete] Paddle cancellation failed for user=%s customer=%s subscriptions=%s; kept with the tombstone for the reconcile job',
        userId, unpaid.paddleCustomerId ?? '-', r.failed.join(',') || '-')
    }
  }
  const tables = await deleteUserData()
  const at = Math.floor(Date.now() / 1000)
  const tomb = { deletedAt: at, ...(unpaid ?? {}) }
  await db.insert(deletedUsers).values(mine(tomb)).onConflictDoUpdate({ target: deletedUsers.userId, set: tomb })
  if (opts.deleteClerkUser) {
    const { clerkClient } = await import('@clerk/nextjs/server')
    await (await clerkClient()).users.deleteUser(userId)
  }
  return { ok: true, tables }
}
