'use client'

// The signed-in user's entitlements in the browser (Phase 4): the dashboard layout reads them on the server and passes
// them in, so gating needs no extra request. The server checks every gated action again (lib/billing/access.ts).
import { createContext, useContext, useMemo } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SELF_HOST, fromClient, upsellText, type ClientEntitlements, type Entitlements, type Feature } from '@/lib/billing/entitlements'

const Ctx = createContext<Entitlements>(SELF_HOST)

export function EntitlementsProvider({ value, children }: { value: ClientEntitlements; children: React.ReactNode }) {
  const e = useMemo(() => fromClient(value), [value])
  return <Ctx.Provider value={e}>{children}</Ctx.Provider>
}

export const useEntitlements = () => useContext(Ctx)

// A calm hint instead of a locked feature: what it is, that the data stays, where to change the plan.
export function Upsell({ feature, className }: { feature: Feature; className?: string }) {
  return (
    <div className={cn('rounded-card bg-secondary px-4 py-3 text-body-sm shadow-hairline', className)}>
      <p className="flex items-start gap-2 text-muted-foreground">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span>{upsellText(feature)}</span>
      </p>
      <Link href="/settings#abo" className="tap mt-2 inline-block text-caption font-medium text-brand-text hover:underline">Abo ansehen →</Link>
    </div>
  )
}

// Children when the feature is included, otherwise the upsell (or `fallback`).
export function PlusGate({ feature, children, fallback }: { feature: Feature; children: React.ReactNode; fallback?: React.ReactNode }) {
  const e = useEntitlements()
  if (e.features[feature]) return <>{children}</>
  return <>{fallback ?? <Upsell feature={feature} />}</>
}
