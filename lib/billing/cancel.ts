// Cancellation (§312k BGB "Kündigungsbutton", Phase 4): cancels the current user's Paddle subscription at the end of
// the paid period and records it; a second subscription (12-05) is cancelled with it. The in-app trial needs no cancellation (it ends by itself, no card on file).
import { loadSubscription, clearEntitlementsCache } from './access'
import { cancelSubscription, getSubscription, type PaddleSubscription } from './paddle'
import { saveCancelled, stampSeen, updateSubscription } from './webhook'

export type CancelResult =
  | { ok: true; kind: 'subscription'; endsAt: number | null; at: number }
  | { ok: true; kind: 'trial'; endsAt: number | null; at: number }
  | { ok: true; kind: 'none'; at: number }
  | { ok: false; error: string; failed: string[] }       // failed: the Paddle subscription ids still running

// Paddle refuses to cancel a subscription that already ended (or, for the period end, that is already scheduled to):
// on an error the subscription is looked up, and if it is already where it should be, that counts as done.
async function cancelAtPaddle(id: string, when: 'next_billing_period' | 'immediately'): Promise<PaddleSubscription> {
  try {
    return await cancelSubscription(id, when)
  } catch (err) {
    const s = await getSubscription(id).catch(() => null)
    if (s && (s.status === 'canceled' || (when === 'next_billing_period' && s.scheduled_change?.action === 'cancel'))) return s
    throw err
  }
}

// Every live subscription of the account: the stored one and any second one (12-05, `otherSubscriptionIds`).
export async function cancelCurrent(when: 'next_billing_period' | 'immediately' = 'next_billing_period'): Promise<CancelResult> {
  const at = Math.floor(Date.now() / 1000)
  const row = await loadSubscription()
  const others = row?.otherSubscriptionIds ?? []
  const mainLive = !!row?.paddleSubscriptionId && row.status !== 'canceled'
  if (!row || (!mainLive && !others.length)) {
    return row?.trialEndsAt && !row.paddleSubscriptionId ? { ok: true, kind: 'trial', endsAt: row.trialEndsAt, at } : { ok: true, kind: 'none', at }
  }
  const failed: string[] = []
  let endsAt = row.currentPeriodEnd
  // Already ends with the paid period: asking Paddle again changes nothing (and a second form request lands here).
  if (mainLive && !(when === 'next_billing_period' && row.cancelAtPeriodEnd)) {
    try {
      const s = await cancelAtPaddle(row.paddleSubscriptionId!, when)
      const next = await saveCancelled(s)
      endsAt = when === 'immediately' ? at : next?.currentPeriodEnd ?? row.currentPeriodEnd
    } catch (err: any) {
      failed.push(row.paddleSubscriptionId!)
      console.error('[billing/cancel] user=%s subscription=%s failed: %s', row.userId, row.paddleSubscriptionId, err?.message)
    }
  }
  if (others.length) {
    const left: string[] = []
    for (const id of others) {
      try {
        await cancelAtPaddle(id, when)
      } catch (err: any) {
        left.push(id)
        console.error('[billing/cancel] user=%s second subscription=%s failed: %s', row.userId, id, err?.message)
      }
    }
    failed.push(...left)
    const done = others.filter((id) => !left.includes(id))
    // Stamped as seen now, so an older "active" event arriving late does not put a cancelled one back.
    await updateSubscription((r) => (r ? {
      ...r,
      otherSubscriptionIds: (r.otherSubscriptionIds ?? []).filter((id) => !done.includes(id)),
      otherSubscriptionSeen: done.reduce((seen, id) => stampSeen(seen, id, at), r.otherSubscriptionSeen),
    } : null))
  }
  clearEntitlementsCache()
  if (failed.length) {
    return { ok: false, failed, error: 'Die Kündigung konnte gerade nicht an den Zahlungsanbieter übermittelt werden. Bitte versuche es gleich noch einmal; bleibt der Fehler, schreib uns (Kontakt im Impressum).' }
  }
  return { ok: true, kind: 'subscription', endsAt, at }
}
