'use client'

// One calm line above the page when the plan needs attention (payment open, access ended, trial ending soon).
import Link from 'next/link'
import { stateNotice } from '@/lib/billing/entitlements'
import { useEntitlements } from './Entitlements'

const SOON_S = 5 * 86_400

export function BillingNotice() {
  const e = useEntitlements()
  if (!e.billing) return null
  const now = Math.floor(Date.now() / 1000)
  const show = e.state === 'past_due' || e.state === 'expired' || (e.state === 'trial' && e.trialEndsAt != null && e.trialEndsAt - now < SOON_S)
  const text = show ? stateNotice(e, now) : null
  if (!text) return null
  return (
    <p className="mb-4 rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
      {text} <Link href="/settings#abo" className="font-medium text-brand hover:underline">Abo ansehen</Link>
    </p>
  )
}
