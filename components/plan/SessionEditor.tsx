'use client'

// "Einheit ändern" (07-08): pick what the day is, km and pace; preview before saving; saved as a manual edit.
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { type PlanSession } from '@/lib/plan/types'
import { fmtKm } from '@/lib/plan/format'
import { parseKm } from '@/lib/plan/effective'
import { blockPaces } from '@/lib/plan/blocks'
import { EDIT_KINDS, editError, editSession, type EditKind } from '@/lib/plan/session-templates'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { SessionDetails } from './SessionDetails'

export function SessionEditor({ date, current, sessions, saving, onSave }: {
  date: string; current?: PlanSession; sessions: PlanSession[]; saving: boolean; onSave: (s: PlanSession) => void
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<EditKind>('easy')
  const [kmText, setKmText] = useState(fmtKm(current?.km || 10))
  const [paceText, setPaceText] = useState('')
  const def = EDIT_KINDS.find((k) => k.kind === kind)!
  const paces = blockPaces(date)
  const pace = def.pace ? (paceText || paces[def.pace]) : undefined
  const km = kind === 'rest' ? 0 : parseKm(kmText) ?? NaN
  const error = editError(kind, km, date, sessions, def.pace ? pace : undefined)
  const preview = error ? null : editSession(kind, km, date, pace)

  if (!open) {
    return (
      <Button size="action" onClick={() => setOpen(true)} disabled={saving} className="mt-3">
        <Pencil /> Einheit ändern
      </Button>
    )
  }
  return (
    <div className="mt-3 rounded-card bg-secondary p-3 text-caption">
      <div className="font-medium">Einheit ändern</div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="group" aria-label="Art der Einheit">
        {EDIT_KINDS.map((k) => (
          <button key={k.kind} type="button" aria-pressed={kind === k.kind} disabled={saving}
            onClick={() => { setKind(k.kind); setPaceText(''); if ((parseKm(kmText) ?? 0) < k.minKm) setKmText(fmtKm(k.minKm)) }}
            className={cn('tap rounded-control px-2 py-1.5 font-medium',
              kind === k.kind ? 'bg-foreground text-background' : 'bg-card shadow-hairline hover:bg-secondary')}>
            {k.label}
          </button>
        ))}
      </div>
      {kind !== 'rest' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5">
            <span className="font-medium">km</span>
            <Input small inputMode="decimal" value={kmText} onChange={(e) => setKmText(e.target.value)} disabled={saving} className="w-16 text-center tabular-nums" />
          </label>
          {def.pace && (
            <label className="flex items-center gap-1.5">
              <span className="font-medium">Tempo</span>
              <Input small value={paceText} placeholder={paces[def.pace]} onChange={(e) => setPaceText(e.target.value.trim())} disabled={saving} className="w-16 text-center tabular-nums" />
              <span className="text-muted-foreground">/km</span>
            </label>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-error">{error}</p>}
      {preview && preview.type !== 'rest' && (
        <div className="mt-2 rounded-card bg-card p-2.5 shadow-hairline">
          <div className="font-medium">{preview.title} · {fmtKm(preview.km ?? 0)} km</div>
          <SessionDetails session={preview} />
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <Button size="action" variant="primary" disabled={!preview || saving} onClick={() => { if (preview) { onSave(preview); setOpen(false) } }}>
          Übernehmen
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  )
}
