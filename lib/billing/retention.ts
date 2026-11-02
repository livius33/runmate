// Retention of expired accounts (Phase 5, decided by Livius): an account whose plan has expired is deleted after
// 12 months without activity, with a reminder 30 days before. "Activity" = a dashboard visit (subscription.last_seen_at,
// stamped at most once a day by lib/billing/access.ts); the clock starts no earlier than the day the plan ended.
// `dueForDeletion` is pure; the cron route (app/api/cron/expired-accounts) sends the reminder and deletes.
// Paying, trialing and past_due accounts are never touched, and self-hosted installs (no billing) have no rows.
import { planState, type SubscriptionLike } from './entitlements'

export const RETENTION = {
  idleDays: 365,          // 12 months without activity after the plan ended …
  noticeDays: 30,         // … the reminder goes out this many days before
}
const DAY = 86_400

export interface RetentionRow extends SubscriptionLike {
  canceledAt: number | null
  lastSeenAt: number | null
  noticeSentAt: number | null
  updatedAt: number
}

export type RetentionDecision = 'keep' | 'notice' | 'delete'

// When the plan ended: the latest of trial end, period end and cancellation (the row's last change as a fallback).
export function endedAt(r: RetentionRow): number {
  const marks = [r.trialEndsAt, r.currentPeriodEnd, r.canceledAt].filter((x): x is number => x != null)
  return marks.length ? Math.max(...marks) : r.updatedAt
}

// Last sign of life: a visit, or the end of the plan, whichever is later.
export const lastActivity = (r: RetentionRow) => Math.max(r.lastSeenAt ?? 0, endedAt(r))

// A reminder counts only if nothing happened after it (a visit voids it; the next idle period needs a new one).
const noticeValid = (r: RetentionRow) => r.noticeSentAt != null && (r.lastSeenAt == null || r.lastSeenAt <= r.noticeSentAt)

export function dueForDeletion(r: RetentionRow, nowS: number): RetentionDecision {
  if (planState(r, nowS, true) !== 'expired') return 'keep'
  const idle = nowS - lastActivity(r)
  if (noticeValid(r)) {
    // Deleted only with a reminder at least 30 days old and 12 months idle; never without a reminder.
    return idle >= RETENTION.idleDays * DAY && nowS - r.noticeSentAt! >= RETENTION.noticeDays * DAY ? 'delete' : 'keep'
  }
  return idle >= (RETENTION.idleDays - RETENTION.noticeDays) * DAY ? 'notice' : 'keep'
}

// The date the account will be deleted at when a reminder goes out now (shown in the email).
export const deletionDate = (r: RetentionRow, nowS: number) =>
  new Date(Math.max(lastActivity(r) + RETENTION.idleDays * DAY, nowS + RETENTION.noticeDays * DAY) * 1000)

// How the reminder reaches the user. Not wired yet (TODO: a transactional mail provider, e.g. Postmark or Resend,
// with the address from Clerk). Without a mailer no reminder is stamped as sent, so no account is ever deleted.
export interface RetentionMailer {
  sendDeletionNotice(userId: string, deleteOn: Date): Promise<boolean>   // true = delivered to the provider
}

export function retentionMailer(): RetentionMailer | null {
  return null
}
