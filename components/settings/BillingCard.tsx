'use client'

// Settings → Abo (Phase 4): status, trial end or renewal date, checkout (Paddle.js, loaded only when needed), the
// customer portal and the cancellation button (§312k BGB → /kuendigen). Hidden on a self-hosted install.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { CreditCard, ExternalLink } from 'lucide-react'
import type { BillingInfo } from '@/app/api/billing/route'
import { STATE_LABEL, fromClient, stateNotice } from '@/lib/billing/entitlements'

const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js'

interface PaddleGlobal {
  Environment: { set(env: string): void }
  Initialize(o: { token: string }): void
  Checkout: { open(o: { items: { priceId: string; quantity: number }[]; customData: Record<string, string>; settings?: Record<string, string> }): void }
}

let paddleReady: Promise<PaddleGlobal> | null = null
function loadPaddle(env: string, token: string): Promise<PaddleGlobal> {
  paddleReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = PADDLE_JS
    s.async = true
    s.onload = () => {
      const P = (window as unknown as { Paddle?: PaddleGlobal }).Paddle
      if (!P) return reject(new Error('Paddle.js fehlt'))
      if (env === 'sandbox') P.Environment.set('sandbox')
      P.Initialize({ token })
      resolve(P)
    }
    s.onerror = () => { paddleReady = null; reject(new Error('Paddle.js konnte nicht geladen werden')) }
    document.head.appendChild(s)
  })
  return paddleReady
}

const fmtDate = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '–')

export function BillingCard() {
  const qc = useQueryClient()
  const { data } = useQuery<BillingInfo>({ queryKey: ['billing'], queryFn: () => fetch('/api/billing').then((r) => r.json()) })
  const [thanks, setThanks] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('abo') !== 'danke') return
    setThanks(true)
    // The webhook usually lands within seconds; look again a few times.
    const t = [3000, 8000, 20000].map((ms) => setTimeout(() => qc.invalidateQueries({ queryKey: ['billing'] }), ms))
    return () => t.forEach(clearTimeout)
  }, [qc])
  const portal = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/billing/portal', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Kundenportal nicht erreichbar')
      return d.url as string
    },
    onSuccess: (url) => { window.location.href = url },
  })

  if (!data?.billing) return null
  const e = fromClient(data.entitlements)
  const sub = data.subscription
  const paid = !!sub?.paddle && sub.status !== 'canceled'
  const now = Math.floor(Date.now() / 1000)
  const notice = stateNotice(e, now)

  const checkout = async (priceId: string) => {
    setError(null)
    if (!data.checkout?.clientToken) return setError('Die Zahlung ist auf dieser Installation noch nicht eingerichtet.')
    try {
      const P = await loadPaddle(data.checkout.env, data.checkout.clientToken)
      P.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customData: { userId: data.userId },
        settings: { successUrl: `${window.location.origin}/settings?abo=danke#abo` },
      })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div id="abo" className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><CreditCard className="h-4 w-4 text-brand" /> Abo</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd className="font-medium">{STATE_LABEL[e.state]}{e.tier && e.state === 'past_due' ? ` (${e.tier === 'plus' ? 'Plus' : 'Basic'})` : ''}{sub?.interval ? ` · ${sub.interval === 'year' ? 'jährlich' : 'monatlich'}` : ''}</dd>
        {e.state === 'trial' && <><dt className="text-muted-foreground">Testphase bis</dt><dd>{fmtDate(e.trialEndsAt)}</dd></>}
        {paid && <><dt className="text-muted-foreground">{e.cancelAtPeriodEnd ? 'Endet am' : 'Verlängert sich am'}</dt><dd>{fmtDate(e.periodEnd)}</dd></>}
      </dl>
      {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}
      {thanks && !paid && <p className="mt-2 text-xs text-teal">Danke! Das Abo ist in wenigen Sekunden aktiv.</p>}

      {!paid && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(['basic', 'plus'] as const).map((tier) => {
            const prices = data.checkout?.prices.filter((p) => p.tier === tier) ?? []
            return (
              <div key={tier} className="rounded-xl border border-border p-4">
                <p className="text-sm font-semibold">{tier === 'plus' ? 'Plus' : 'Basic'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tier === 'plus'
                  ? 'Alles aus Basic, dazu: Plan passt sich selbst an (Verschieben, Ermüdungsschutz, Ausgleich), mehrere Pläne und Rennen, eigene Methode, Renntag-Werkzeuge.'
                  : 'Synchronisierung, Analyse, Hinweise und ein erstellter Trainingsplan; Anpassungen als Vorschläge.'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {prices.length ? prices.map((p) => (
                    <button key={p.priceId} onClick={() => checkout(p.priceId)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white">{p.label}</button>
                  )) : <span className="text-xs text-muted-foreground">Noch nicht buchbar.</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!paid && <p className="mt-2 text-xs text-muted-foreground">Bezahlung über Paddle (Händler und Rechnungssteller). 14 Tage Widerrufsrecht, monatlich bzw. jährlich kündbar.</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {paid && (
          <button onClick={() => portal.mutate()} disabled={portal.isPending} className="inline-flex items-center gap-1 font-medium text-brand hover:underline disabled:opacity-60">
            Zahlungsart, Rechnungen, Tarif ändern <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
        <Link href="/kuendigen" className="font-medium text-foreground underline underline-offset-2">Verträge hier kündigen</Link>
      </div>
      {portal.isError && <p className="mt-2 text-xs text-red-600">{(portal.error as Error).message}</p>}
    </div>
  )
}
