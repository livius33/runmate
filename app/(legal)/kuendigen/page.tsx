import type { Metadata } from 'next'
import { billingEnabled } from '@/lib/billing/config'
import { CancelForm } from '@/components/legal/CancelForm'

export const metadata: Metadata = { title: 'Verträge hier kündigen – Runmate' }
export const dynamic = 'force-dynamic'

const fmt = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

// The cancellation button's confirmation page (§312k BGB, Phase 4). Public: signed in, the account's contract is shown
// and cancelled directly; otherwise name + account email identify it.
async function contractOfSession(): Promise<{ signedIn: boolean; contract: string | null }> {
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return { signedIn: false, contract: null }
    const { runAsUser } = await import('@/lib/server/scope')
    const { loadSubscription } = await import('@/lib/billing/access')
    const row = await runAsUser(userId, loadSubscription, { profile: null })
    if (!row?.paddleSubscriptionId || row.status === 'canceled') {
      return { signedIn: true, contract: row?.trialEndsAt ? `Kostenlose Testphase bis ${fmt(row.trialEndsAt)} (ohne Zahlungsdaten, endet von selbst; danach kostenlos weiter)` : 'Kein laufendes Abo' }
    }
    const interval = row.interval === 'year' ? 'jährlich' : 'monatlich'
    const until = fmt(row.currentPeriodEnd)
    return { signedIn: true, contract: `Runmate Plus, ${interval}${row.cancelAtPeriodEnd ? ` – bereits gekündigt, endet am ${until}` : until ? `, bezahlt bis ${until}` : ''}` }
  } catch {
    return { signedIn: false, contract: null }
  }
}

export default async function KuendigenPage() {
  if (!billingEnabled()) {
    return (
      <div className="grid gap-3 text-body-sm">
        <h1 className="text-title">Verträge hier kündigen</h1>
        <p className="text-muted-foreground">Diese Runmate-Installation hat keine Abos – es gibt nichts zu kündigen.</p>
      </div>
    )
  }
  const { signedIn, contract } = await contractOfSession()
  return (
    <div className="grid gap-4">
      <h1 className="text-title">Verträge hier kündigen</h1>
      <p className="max-w-[68ch] text-body-sm text-muted-foreground">
        Hier kündigst du dein Abo von Runmate Plus. Eine ordentliche Kündigung wirkt zum Ende des bezahlten Zeitraums; bis
        dahin bleibt alles nutzbar. Danach läuft dein Konto kostenlos weiter: Daten, Analyse und ein Trainingsplan bleiben,
        die Funktionen von Plus enden. Export und Löschen gehen jederzeit.
      </p>
      <CancelForm signedIn={signedIn} contract={contract} />
    </div>
  )
}
