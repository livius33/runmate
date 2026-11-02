// Account deletion (Art. 17 GDPR, Phase 4), one path for the Settings button and Clerk's user.deleted webhook:
// cancel the Paddle subscription at once, delete every row of the user, leave a tombstone (Phase 5: a late Paddle
// webhook must not recreate a row), then delete the Clerk user (unless Clerk already deleted it). Runs inside the
// user's scope.
import { db } from '@/lib/db'
import { deletedUsers } from '@/lib/db/public-schema'
import { mine, uid } from '@/lib/db/owned'
import { billingEnabled } from '@/lib/billing/config'
import { cancelCurrent } from '@/lib/billing/cancel'
import { deleteUserData } from './data'

export interface DeleteOptions {
  deleteClerkUser: boolean        // false when Clerk sent user.deleted
  strictBilling: boolean          // true: stop if Paddle cannot be reached (the user can retry); false: delete anyway, log
}

export async function deleteAccount(opts: DeleteOptions): Promise<{ ok: true; tables: string[] } | { ok: false; error: string }> {
  const userId = uid()
  if (billingEnabled()) {
    const r = await cancelCurrent('immediately')
    if (!r.ok) {
      if (opts.strictBilling) return { ok: false, error: 'Dein Abo konnte gerade nicht beendet werden, deshalb ist noch nichts gelöscht. Bitte versuche es gleich noch einmal.' }
      console.error('[account/delete] Paddle cancellation failed; cancel the subscription by hand for this deleted account')
    }
  }
  const tables = await deleteUserData()
  const at = Math.floor(Date.now() / 1000)
  await db.insert(deletedUsers).values(mine({ deletedAt: at })).onConflictDoUpdate({ target: deletedUsers.userId, set: { deletedAt: at } })
  if (opts.deleteClerkUser) {
    const { clerkClient } = await import('@clerk/nextjs/server')
    await (await clerkClient()).users.deleteUser(userId)
  }
  return { ok: true, tables }
}
