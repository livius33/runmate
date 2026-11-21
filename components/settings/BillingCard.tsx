'use client'

// Settings → Abo (Phase 4): status, trial end or renewal date, the Plus offer (checkout via Paddle.js, loaded only when
// needed) with what Free includes, the customer portal and the cancellation button (§312k BGB → /kuendigen). A
// scheduled cancellation can be taken back here, and form requests held after a take-back are confirmed or discarded
// here (12-05, lib/billing/cancel-form.ts). Hidden on a self-hosted install.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { CreditCard, ExternalLink } from 'lucide-react'
import type { BillingInfo } from '@/app/api/billing/route'
import { STATE_LABEL, fromClient, stateNotice } from '@/lib/billing/entitlements'

const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js'

interface PaddleGlobal {
  Environment: { set(env: string): void }
  Initialize(o: { token: string; eventCallback?: (e: { name?: string }) => void }): void
  Checkout: { open(o: { items: { priceId: string; quantity: number }[]; customData: Record<string, string>; settings?: Record<string, string> }): void }
}

let paddleReady: Promise<PaddleGlobal> | null = null
// Paddle.js is initialised once per page; the card listens for the finished checkout through this.
let onPaddleEvent: (name: string) => void = () => {}
function loadPaddle(env: string, token: string): Promise<PaddleGlobal> {
  paddleReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = PADDLE_JS
    s.async = true
    s.onload = () => {
      const P = (window as unknown as { Paddle?: PaddleGlobal }).Paddle
      if (!P) return reject(new Error('Paddle.js fehlt'))
      if (env === 'sandbox') P.Environment.set('sandbox')
      P.Initialize({ token, eventCallback: (e) => { if (e?.name) onPaddleEvent(e.name) } })
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
  // 12-05: the server hands out one checkout per 15 minutes; this tab keeps its grant for reopening the overlay, and
  // after a completed purchase the buttons stay hidden until the subscription arrives.
  const [grant, setGrant] = useState<{ userId: string; userSig: string } | null>(null)
  const [bought, setBought] = useState(false)
  useEffect(() => {
    onPaddleEvent = (name) => { if (name === 'checkout.completed') { setBought(true); setThanks(true) } }
    return () => { onPaddleEvent = () => {} }
  }, [])
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
  const post = async (url: string, body?: unknown) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Das hat gerade nicht geklappt. Bitte noch einmal versuchen.')
    return d
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ['billing'] })
  const undo = useMutation({ mutationFn: () => post('/api/billing/cancel/undo'), onSuccess: refresh })
  const held = useMutation({ mutationFn: (action: 'confirm' | 'discard') => post('/api/billing/cancel/held', { action }), onSuccess: refresh })

  if (!data?.billing) return null
  const e = fromClient(data.entitlements)
  const sub = data.subscription
  const paid = !!sub?.paddle && sub.status !== 'canceled'
  const now = Math.floor(Date.now() / 1000)
  const notice = stateNotice(e, now)
  const prices = data.checkout?.prices ?? []

  const blocked = bought || (!grant && !!data.checkoutBlocked)
  const checkout = async (priceId: string) => {
    setError(null)
    if (!data.checkout?.clientToken) return setError('Die Zahlung ist auf dieser Installation noch nicht eingerichtet.')
    try {
      let g = grant
      if (!g) {
        const r = await fetch('/api/billing/checkout', { method: 'POST' })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { qc.invalidateQueries({ queryKey: ['billing'] }); return setError(d.error ?? 'Der Kauf ist gerade nicht möglich.') }
        g = { userId: d.userId, userSig: d.userSig }
        setGrant(g)
      }
      const P = await loadPaddle(data.checkout.env, data.checkout.clientToken)
      P.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customData: { userId: g.userId, userSig: g.userSig },
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
        <dd className="font-medium">{STATE_LABEL[e.state]}{e.tier && e.state === 'past_due' ? ' (Plus)' : ''}{sub?.interval ? ` · ${sub.interval === 'year' ? 'jährlich' : 'monatlich'}` : ''}</dd>
        {e.state === 'trial' && <><dt className="text-muted-foreground">Testphase bis</dt><dd>{fmtDate(e.trialEndsAt)}</dd></>}
        {paid && <><dt className="text-muted-foreground">{e.cancelAtPeriodEnd ? 'Endet am' : 'Verlängert sich am'}</dt><dd>{fmtDate(e.periodEnd)}</dd></>}
      </dl>
      {notice && <p className="mt-2 text-xs text-muted-foreground">{notice}</p>}
      {paid && e.cancelAtPeriodEnd && (
        <div className="mt-3 rounded-xl border border-border p-3 text-sm">
          <p>{e.periodEnd ? <>Dein Plus endet am <b>{fmtDate(e.periodEnd)}</b>.</> : 'Dein Plus endet mit dem bezahlten Zeitraum.'}{data.cancellation?.viaForm ? ` Die Kündigung kam am ${fmtDate(data.cancellation.at)} über das Kündigungsformular.` : ''}</p>
          <p className="mt-1 text-xs text-muted-foreground">Warst du das nicht, oder hast du es dir anders überlegt? Dann nimm die Kündigung zurück; das Abo läuft weiter wie bisher.</p>
          <button onClick={() => undo.mutate()} disabled={undo.isPending} className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-60">Kündigung zurücknehmen</button>
          {undo.isError && <p className="mt-2 text-xs text-red-600">{(undo.error as Error).message}</p>}
        </div>
      )}
      {data.heldRequests.length > 0 && (
        <div className="mt-3 rounded-xl border border-border p-3 text-sm">
          <p>Über das Kündigungsformular {data.heldRequests.length === 1 ? 'ist eine Kündigung' : `sind ${data.heldRequests.length} Kündigungen`} für dein Konto eingegangen (zuletzt am {fmtDate(data.heldRequests[data.heldRequests.length - 1].at)}).</p>
          <p className="mt-1 text-xs text-muted-foreground">Weil du vor Kurzem eine Kündigung zurückgenommen hast, wird sie erst ausgeführt, wenn du sie hier bestätigst.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => held.mutate('confirm')} disabled={held.isPending} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">Kündigung bestätigen</button>
            <button onClick={() => held.mutate('discard')} disabled={held.isPending} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-60">Verwerfen</button>
          </div>
          {held.isError && <p className="mt-2 text-xs text-red-600">{(held.error as Error).message}</p>}
        </div>
      )}
      {thanks && !paid && <p className="mt-2 text-xs text-teal">Danke! Das Abo ist in wenigen Sekunden aktiv.</p>}

      {!paid && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">Plus</p>
          <p className="mt-1 text-xs text-muted-foreground">Der Plan passt sich selbst an (Verschieben, Ermüdungsschutz, Ausgleich) und lässt sich neu aufbauen, wenn sich Ziel oder Termin ändern. Dazu mehrere Pläne und Rennen, eigene Methode, Renntag-Werkzeuge, Schlaf und HRV im Plan.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {blocked ? (
              <span className="text-xs text-muted-foreground">{bought || data.checkoutBlocked === 'live'
                ? 'Dein Kauf ist eingegangen; das Abo erscheint hier in wenigen Sekunden.'
                : 'Ein Kauf wurde gerade begonnen. Ist er abgeschlossen, erscheint dein Abo hier in wenigen Sekunden; sonst geht es in einer Viertelstunde wieder.'}</span>
            ) : prices.length ? prices.map((p) => (
              <button key={p.priceId} onClick={() => checkout(p.priceId)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white">{p.label}</button>
            )) : <span className="text-xs text-muted-foreground">Noch nicht buchbar.</span>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Kostenlos bleibt: Datenquellen und Import, Analyse und Hinweise, ein Trainingsplan mit Anpassungen als Vorschläge, Export und Löschen.</p>
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
