// Cancellation (§312k BGB "Kündigungsbutton", Phase 4): cancels the current user's Paddle subscription at the end of
// the paid period and records it. The in-app trial needs no cancellation (it ends by itself, no card on file).
import { loadSubscription, clearEntitlementsCache } from './access'
import { cancelSubscription } from './paddle'
import { saveCancelled } from './webhook'

export type CancelResult =
  | { ok: true; kind: 'subscription'; endsAt: number | null; at: number }
  | { ok: true; kind: 'trial'; endsAt: number | null; at: number }
  | { ok: true; kind: 'none'; at: number }
  | { ok: false; error: string }

export async function cancelCurrent(when: 'next_billing_period' | 'immediately' = 'next_billing_period'): Promise<CancelResult> {
  const at = Math.floor(Date.now() / 1000)
  const row = await loadSubscription()
  if (!row?.paddleSubscriptionId || row.status === 'canceled') {
    return row?.trialEndsAt && !row.paddleSubscriptionId ? { ok: true, kind: 'trial', endsAt: row.trialEndsAt, at } : { ok: true, kind: 'none', at }
  }
  try {
    const s = await cancelSubscription(row.paddleSubscriptionId, when)
    const next = await saveCancelled(s)
    clearEntitlementsCache()
    return { ok: true, kind: 'subscription', endsAt: when === 'immediately' ? at : next?.currentPeriodEnd ?? row.currentPeriodEnd, at }
  } catch (err: any) {
    console.error('[billing/cancel]', err?.message)
    return { ok: false, error: 'Die Kündigung konnte gerade nicht an den Zahlungsanbieter übermittelt werden. Bitte versuche es gleich noch einmal; bleibt der Fehler, schreib uns (Kontakt im Impressum).' }
  }
}
