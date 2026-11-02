'use client'

// Without Plus the engine suggests instead of changing the plan (lib/plan/engine-store.ts): each suggestion with its
// reason, "Übernehmen" (exactly this change) or "Ablehnen" (not suggested again).
import { Check, X } from 'lucide-react'
import type { EngineChange } from '@/lib/plan/engine'
import { Upsell } from '@/components/billing/Entitlements'
import { Card } from './ui'

export function EngineSuggestions({ suggestions, onDecide, busy, error }: {
  suggestions: EngineChange[]
  onDecide: (key: string, decline: boolean) => void
  busy: boolean
  error: string | null
}) {
  if (!suggestions.length) return null
  return (
    <Card title="Vorschläge für deinen Plan" aside={<span className="text-xs text-muted-foreground">nach festen Regeln</span>}>
      <ul className="grid gap-2.5 text-sm">
        {suggestions.map((c) => (
          <li key={c.key} className="flex items-start justify-between gap-3">
            <p className="min-w-0">{c.reason}</p>
            <div className="flex shrink-0 gap-1.5">
              <button onClick={() => onDecide(c.key, false)} disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                <Check className="h-3 w-3" /> Übernehmen
              </button>
              <button onClick={() => onDecide(c.key, true)} disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:border-foreground/50 disabled:opacity-50">
                <X className="h-3 w-3" /> Ablehnen
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <Upsell feature="autoAdapt" className="mt-3" />
    </Card>
  )
}
