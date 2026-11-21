'use client'

// Without Plus the engine suggests instead of changing the plan (lib/plan/engine-store.ts): each suggestion with its
// reason, "Übernehmen" (exactly this change) or "Ablehnen" (not suggested again).
import { Check, X } from 'lucide-react'
import type { EngineChange } from '@/lib/plan/engine'
import { Upsell } from '@/components/billing/Entitlements'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function EngineSuggestions({ suggestions, onDecide, busy, error }: {
  suggestions: EngineChange[]
  onDecide: (key: string, decline: boolean) => void
  busy: boolean
  error: string | null
}) {
  if (!suggestions.length) return null
  return (
    <Card title="Vorschläge für deinen Plan" aside="nach festen Regeln">
      <ul className="grid gap-2.5 text-body-sm">
        {suggestions.map((c) => (
          <li key={c.key} className="flex items-start justify-between gap-3">
            <p className="min-w-0">{c.reason}</p>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="primary" onClick={() => onDecide(c.key, false)} disabled={busy}>
                <Check /> Übernehmen
              </Button>
              <Button size="sm" onClick={() => onDecide(c.key, true)} disabled={busy}>
                <X /> Ablehnen
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-caption text-error">{error}</p>}
      <Upsell feature="autoAdapt" className="mt-3" />
    </Card>
  )
}
