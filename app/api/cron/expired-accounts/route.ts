import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { subscription } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { runAsUser } from '@/lib/server/scope'
import { cronUnauthorized } from '@/lib/server/cron-auth'
import { billingEnabled } from '@/lib/billing/config'
import { deletionDate, dueForDeletion, retentionMailer } from '@/lib/billing/retention'
import { deleteAccount } from '@/lib/account/delete'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_DELETES = 20          // per run; the rest follow the next night

// Daily (Phase 5): free accounts idle for 12 months are deleted, with a reminder 30 days before
// (lib/billing/retention.ts). Without a configured mailer no reminder is sent or stamped, so nothing is deleted.
// The response lists counts only.
export async function GET(req: NextRequest) {
  const unauthorized = cronUnauthorized(req)
  if (unauthorized) return unauthorized
  if (!billingEnabled()) return NextResponse.json({ ok: true, billing: false })

  const now = Math.floor(Date.now() / 1000)
  // cross-user: the cron has no session; it decides per subscription row and then acts inside that user's scope
  const rows = await db.select().from(subscription)
  const mailer = retentionMailer()
  let notices = 0, unsent = 0, deleted = 0, failed = 0
  for (const row of rows) {
    const due = dueForDeletion(row, now)
    if (due === 'keep') continue
    try {
      if (due === 'notice') {
        if (!mailer || !(await mailer.sendDeletionNotice(row.userId, deletionDate(row, now)))) { unsent++; continue }
        await runAsUser(row.userId, async () => { await db.update(subscription).set({ noticeSentAt: now }).where(own(subscription)) }, { profile: null })
        notices++
      } else if (deleted < MAX_DELETES) {
        const r = await runAsUser(row.userId, () => deleteAccount({ deleteClerkUser: true, strictBilling: false }), { profile: null })
        if (r.ok) deleted++
        else failed++
      }
    } catch (err) {
      failed++
      console.error('[cron/expired-accounts] failed:', err instanceof Error ? err.name : 'unknown')
    }
  }
  return NextResponse.json({ ok: true, accounts: rows.length, notices, unsent, deleted, failed, mailer: !!mailer })
}
