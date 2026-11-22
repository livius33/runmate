'use client'

// "Wie war's?" (07-25): RPE 1–10, Gefühl 1–5, Schmerzen, optional note — every tap saves at once through
// PATCH /api/running/runs/[id]. Schmerzen and the note are stored together with a Gefühl (the run_feedback contract),
// so until a Gefühl is chosen they wait here and the row says so. Used on the run page and in the Heute card.
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEELS, FEEL_LABEL, NOTE_MAX, PAINS, PAIN_LABEL, RPE_MAX, type Feel, type Pain } from '@/lib/feedback/run'

export interface FeedbackValue { rpe: number | null; feel: Feel | null; pain: Pain | null; note: string | null }
export const EMPTY_FEEDBACK: FeedbackValue = { rpe: null, feel: null, pain: null, note: null }

const RPES = Array.from({ length: RPE_MAX }, (_, i) => i + 1)
const RPE_HINT = (n: number) => (n <= 2 ? 'sehr leicht' : n <= 4 ? 'leicht' : n <= 6 ? 'anstrengend' : n <= 8 ? 'hart' : 'maximal')

async function patch(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/running/runs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? 'Speichern fehlgeschlagen')
}

const seg = 'inline-flex rounded-control bg-card p-0.5 shadow-hairline'
const btn = (on: boolean, danger = false) => cn('tap min-w-6 rounded-control px-2 py-1 text-caption font-medium tabular-nums',
  on ? (danger ? 'bg-destructive text-destructive-foreground' : 'bg-foreground text-background') : 'text-muted-foreground hover:text-foreground')

export function RunFeedback({ id, value, onSaved, title = 'Wie war’s?', className }: {
  id: string; value: FeedbackValue; onSaved?: () => void; title?: string; className?: string
}) {
  const [v, setV] = useState<FeedbackValue>(value)
  const [note, setNote] = useState(value.note ?? '')
  // The server's value arrives after the first render (and after a sync); keep the row in step with it.
  useEffect(() => { setV(value); setNote(value.note ?? '') }, [id, value.rpe, value.feel, value.pain, value.note]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMutation({ mutationFn: (body: Record<string, unknown>) => patch(id, body), onSuccess: () => onSaved?.() })

  const waiting = v.feel == null && (v.pain != null || !!note.trim())
  const setRpe = (rpe: number) => { const next = v.rpe === rpe ? null : rpe; setV({ ...v, rpe: next }); m.mutate({ rpe: next }) }
  const setFeel = (feel: Feel) => {
    const next = v.feel === feel ? null : feel
    setV({ ...v, feel: next })
    m.mutate(next == null ? { feel: null } : { feel: next, ...(v.pain ? { pain: v.pain } : {}), ...(note.trim() ? { note: note.trim() } : {}) })
  }
  const setPain = (pain: Pain) => { setV({ ...v, pain }); if (v.feel != null) m.mutate({ pain }) }
  const saveNote = () => { const n = note.trim(); if (v.feel != null && n !== (v.note ?? '')) { setV({ ...v, note: n || null }); m.mutate({ note: n || null }) } }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-body-sm font-medium">{title}</span>
        {m.isPending ? <span className="text-caption text-muted-foreground">Speichert…</span>
          : m.isError ? <span className="inline-flex items-center gap-1 text-caption text-error"><AlertTriangle className="h-3.5 w-3.5" />{(m.error as Error).message}</span>
          : m.isSuccess ? <span className="inline-flex items-center gap-1 text-caption text-teal-text"><Check className="h-3.5 w-3.5 text-teal" />Gespeichert</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption">
        <label className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Anstrengung</span>
          <span className={seg} role="group" aria-label="RPE 1 bis 10">
            {RPES.map((n) => <button key={n} type="button" aria-pressed={v.rpe === n} title={`RPE ${n}: ${RPE_HINT(n)}`} onClick={() => setRpe(n)} className={btn(v.rpe === n)}>{n}</button>)}
          </span>
          {v.rpe != null && <span className="text-muted-foreground">{RPE_HINT(v.rpe)}</span>}
        </label>
        <label className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Gefühl</span>
          <span className={seg} role="group" aria-label="Gefühl 1 bis 5">
            {FEELS.map((f) => <button key={f} type="button" aria-pressed={v.feel === f} title={FEEL_LABEL[f]} onClick={() => setFeel(f)} className={btn(v.feel === f)}>{f}</button>)}
          </span>
          {v.feel != null && <span className="text-muted-foreground">{FEEL_LABEL[v.feel]}</span>}
        </label>
        <label className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">Schmerzen</span>
          <span className={seg} role="group" aria-label="Schmerzen">
            {PAINS.map((p) => <button key={p} type="button" aria-pressed={v.pain === p} onClick={() => setPain(p)} className={btn(v.pain === p, p === 'stop')}>{PAIN_LABEL[p]}</button>)}
          </span>
        </label>
        <input type="text" value={note} maxLength={NOTE_MAX} placeholder="Notiz (optional)" aria-label="Notiz"
          onChange={(e) => setNote(e.target.value)} onBlur={saveNote} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="h-8 min-w-[10rem] flex-1 rounded-control bg-card px-2 text-caption shadow-hairline outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      {waiting && <p className="text-caption text-muted-foreground">Gefühl wählen, dann werden Schmerzen und Notiz gespeichert.</p>}
    </div>
  )
}
