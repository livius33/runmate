// 12-05 review 10: Settings → Abo with a stored cancellation. A free account that sent the form (endsAt null) shows no
// cancellation box; a paid one without a known period end shows no empty date.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BillingCard } from '@/components/settings/BillingCard'
import { entitlements, toClient } from '@/lib/billing/entitlements'
import type { BillingInfo } from '@/app/api/billing/route'

const NOW = Math.floor(Date.now() / 1000)
const render = (info: BillingInfo) => {
  const qc = new QueryClient()
  qc.setQueryData(['billing'], info)
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: qc }, createElement(BillingCard)))
}
const base = (sub: Parameters<typeof entitlements>[0], paddle: boolean): BillingInfo => ({
  billing: true,
  entitlements: toClient(entitlements(sub, NOW, true)),
  subscription: sub && { status: sub.status, tier: sub.tier, interval: 'month', trialEndsAt: sub.trialEndsAt, periodEnd: sub.currentPeriodEnd, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, paddle },
  checkout: null,
  checkoutBlocked: null,
  cancellation: { at: NOW - 60, endsAt: null, viaForm: true },
  heldRequests: [],
})

describe('Abo-Karte mit gespeicherter Kündigung', () => {
  it('kostenloses Konto, Formular ohne Enddatum: kein Kündigungshinweis, kein leeres Datum', () => {
    const html = render(base({ status: 'trialing', tier: null, trialEndsAt: 1, currentPeriodEnd: null, cancelAtPeriodEnd: false }, false))
    expect(html).not.toContain('endet am')
    expect(html).not.toContain('Kündigung zurücknehmen')
    expect(html).not.toMatch(/am <b>–<\/b>/)
  })

  it('Plus gekündigt ohne bekanntes Periodenende: Text ohne Datum', () => {
    const html = render(base({ status: 'active', tier: 'plus', trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: true }, true))
    expect(html).toContain('Dein Plus endet mit dem bezahlten Zeitraum.')
    expect(html).toContain('Kündigung zurücknehmen')
  })

  it('Plus gekündigt mit Periodenende: das Datum', () => {
    const end = NOW + 10 * 86_400
    const html = render(base({ status: 'active', tier: 'plus', trialEndsAt: null, currentPeriodEnd: end, cancelAtPeriodEnd: true }, true))
    expect(html).toContain(`Dein Plus endet am <b>${new Date(end * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</b>.`)
  })
})
