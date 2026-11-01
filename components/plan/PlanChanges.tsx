'use client'

import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { RotateCcw } from 'lucide-react'
import type { EngineChange } from '@/lib/plan/engine'
import { cn } from '@/lib/utils'
import { Card } from './ui'

// The plan engine's log: what it changed and why, newest first, with undo.
export function PlanChanges({ log, onUndo, busy, error }: {
  log: EngineChange[]
  onUndo: (id: string) => void
  busy: boolean
  error: string | null
}) {
  const entries = [...log].reverse()
  return (
    <Card title="Plan-Anpassungen" aside={<span className="text-xs text-muted-foreground">automatisch, nach festen Regeln</span>}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine automatischen Anpassungen.</p>
      ) : (
        <ul className="grid gap-2.5 text-sm">
          {entries.map((c) => (
            <li key={c.id} className={cn('flex items-start justify-between gap-3', c.status === 'undone' && 'opacity-50')}>
              <div className="min-w-0">
                <p className={cn(c.status === 'undone' && 'line-through', c.status === 'info' && 'text-amber-700')}>{c.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(c.at), "d.M. 'um' HH:mm", { locale: de })}
                  {c.status === 'undone' && ' · zurückgenommen'}
                  {c.status === 'info' && ' · keine Änderung'}
                </p>
              </div>
              {c.status === 'active' && (
                <button onClick={() => onUndo(c.id)} disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:border-foreground/50 disabled:opacity-50">
                  <RotateCcw className="h-3 w-3" /> Rückgängig
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-xs text-brand">{error}</p>}
    </Card>
  )
}
