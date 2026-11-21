'use client'

import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { RotateCcw } from 'lucide-react'
import type { EngineChange } from '@/lib/plan/engine'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// The plan engine's log: what it changed and why, newest first, with undo.
export function PlanChanges({ log, onUndo, busy, error, className }: {
  log: EngineChange[]
  onUndo: (id: string) => void
  busy: boolean
  error: string | null
  className?: string
}) {
  const entries = [...log].reverse()
  return (
    <Card title="Plan-Anpassungen" aside="automatisch, nach festen Regeln" className={cn('h-full', className)}>
      {entries.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">Noch keine automatischen Anpassungen.</p>
      ) : (
        <ul className="grid gap-2.5 text-body-sm">
          {entries.map((c) => (
            <li key={c.id} className={cn('flex items-start justify-between gap-3', c.status === 'undone' && 'opacity-50')}>
              <div className="min-w-0">
                <p className={cn(c.status === 'undone' && 'line-through', c.status === 'info' && 'text-warning')}>{c.reason}</p>
                <p className="text-caption text-muted-foreground">
                  {format(parseISO(c.at), "d.M. 'um' HH:mm", { locale: de })}
                  {c.status === 'undone' && ' · zurückgenommen'}
                  {c.status === 'info' && ' · keine Änderung'}
                </p>
              </div>
              {c.status === 'active' && (
                <Button size="sm" onClick={() => onUndo(c.id)} disabled={busy}>
                  <RotateCcw /> Rückgängig
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-caption text-error">{error}</p>}
    </Card>
  )
}
