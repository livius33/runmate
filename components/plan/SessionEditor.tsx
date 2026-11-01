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
      <button type="button" onClick={() => setOpen(true)} disabled={saving}
        className="tap mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50">
        <Pencil className="h-3.5 w-3.5" /> Einheit ändern
      </button>
    )
  }
  return (
    <div className="mt-3 rounded-lg bg-secondary/50 p-3 text-xs">
      <div className="font-medium">Einheit ändern</div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="group" aria-label="Art der Einheit">
        {EDIT_KINDS.map((k) => (
          <button key={k.kind} type="button" aria-pressed={kind === k.kind} disabled={saving}
            onClick={() => { setKind(k.kind); setPaceText(''); if ((parseKm(kmText) ?? 0) < k.minKm) setKmText(fmtKm(k.minKm)) }}
            className={cn('tap rounded-md border px-2 py-1.5 font-medium',
              kind === k.kind ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/50')}>
            {k.label}
          </button>
        ))}
      </div>
      {kind !== 'rest' && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-1.5">
            <span className="font-medium">km</span>
            <input inputMode="decimal" value={kmText} onChange={(e) => setKmText(e.target.value)} disabled={saving}
              className="h-7 w-16 rounded-md border border-border bg-card px-2 text-center tabular-nums outline-none focus:border-foreground/60" />
          </label>
          {def.pace && (
            <label className="flex items-center gap-1.5">
              <span className="font-medium">Tempo</span>
              <input value={paceText} placeholder={paces[def.pace]} onChange={(e) => setPaceText(e.target.value.trim())} disabled={saving}
                className="h-7 w-16 rounded-md border border-border bg-card px-2 text-center tabular-nums outline-none focus:border-foreground/60" />
              <span className="text-muted-foreground">/km</span>
            </label>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-brand">{error}</p>}
      {preview && preview.type !== 'rest' && (
        <div className="mt-2 rounded-md border border-border bg-card p-2.5">
          <div className="font-medium">{preview.title} · {fmtKm(preview.km ?? 0)} km</div>
          <SessionDetails session={preview} />
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" disabled={!preview || saving} onClick={() => { if (preview) { onSave(preview); setOpen(false) } }}
          className="rounded-lg bg-foreground px-2.5 py-1.5 font-medium text-background hover:bg-foreground/85 disabled:opacity-40">
          Übernehmen
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2.5 py-1.5 font-medium text-muted-foreground hover:text-foreground">
          Abbrechen
        </button>
      </div>
    </div>
  )
}
