'use client'

// Krank / Pause (07-08): mark days off, end the pause ("Wieder fit ab …"), delete it; shows the return plan.
// Used inside the Heute card and under the week editor (no extra card).
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { addDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Thermometer, X } from 'lucide-react'
import { allSessions, activeBlock } from '@/lib/plan/blocks'
import { pauseEnd, pauseLayer, returnText, PAUSE_LABEL, type Pause, type PauseKind } from '@/lib/plan/pause'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')

export function usePauses() {
  return useQuery<Pause[]>({
    queryKey: ['plan-pauses'],
    queryFn: () => fetch('/api/running/plan-pauses').then((r) => (r.ok ? r.json() : { pauses: [] })).then((d) => d.pauses ?? []),
  })
}

function usePauseMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ method, body, id }: { method: 'POST' | 'PATCH' | 'DELETE'; body?: unknown; id?: string }) => {
      const r = await fetch(`/api/running/plan-pauses${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error ?? 'Speichern fehlgeschlagen')
      return data.pauses as Pause[]
    },
    onSuccess: (pauses) => {
      qc.setQueryData(['plan-pauses'], pauses)
      qc.invalidateQueries({ queryKey: ['plan-engine'] })
      qc.invalidateQueries({ queryKey: ['plan-rebuild'] })
    },
  })
}

const dm = (d: string) => format(parseISO(d), 'EEEEEE d.M.', { locale: de })

// `rebuildLink`: false on „Plan anpassen“, where the rebuild sits next to this control.
export function PauseControl({ today, compact = false, rebuildLink = true }: { today: string; compact?: boolean; rebuildLink?: boolean }) {
  const { data: pauses = [] } = usePauses()
  const m = usePauseMutation()
  const [form, setForm] = useState(false)
  const [kind, setKind] = useState<PauseKind>('krank')
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState('')
  const [backFrom, setBackFrom] = useState(day(today, 1))

  // The pause that matters now: running, or its return window still ahead.
  const current = pauses.find((p) => p.from <= day(today, 1) && today <= day(pauseEnd(p, today), 14))
  const window = useMemo(() => {
    if (!current) return null
    return pauseLayer(new Map(allSessions().map((s) => [s.date, s])), { pauses: [current], today }).windows[0]
  }, [current, today])
  const running = current && pauseEnd(current, today) >= today
  const generated = !activeBlock(today).handWritten && !activeBlock(today).base

  if (current && window) {
    if (compact) return null                                   // the Heute card shows the running pause
    return (
      <div className={cn('rounded-card bg-warning-soft px-3 py-2.5 text-body-sm', !compact && 'mt-3')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-warning">
          <Thermometer className="h-4 w-4" />
          {PAUSE_LABEL[current.kind]} seit {dm(current.from)}{current.to ? ` bis ${dm(current.to)}` : ' (noch offen)'}
        </div>
        {!running || current.to ? <p className="mt-1">{returnText(window)}</p>
          : <p className="mt-1">Alle Einheiten bis heute fallen aus. Sag Bescheid, ab wann du wieder läufst – dann plant Runmate den Wiedereinstieg.</p>}
        {window.replan && generated && rebuildLink && (
          <Link href="/plan/anpassen" className="mt-1 inline-block font-medium underline underline-offset-2">Plan neu aufbauen →</Link>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
          {running && !current.to && (
            <>
              <label className="flex items-center gap-1.5">
                <span>Wieder fit ab</span>
                <Input small type="date" value={backFrom} min={current.from} onChange={(e) => setBackFrom(e.target.value)} className="w-auto tabular-nums" />
              </label>
              <Button size="sm" variant="primary" disabled={m.isPending || !backFrom}
                onClick={() => m.mutate({ method: 'PATCH', body: { id: current.id, to: day(backFrom, -1) < current.from ? current.from : day(backFrom, -1) } })}>Übernehmen</Button>
            </>
          )}
          <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ method: 'DELETE', id: current.id })}>
            <X /> Pause löschen
          </Button>
        </div>
        {m.isError && <p className="mt-2 text-caption text-error">{(m.error as Error).message}</p>}
      </div>
    )
  }

  if (!form) {
    return (
      <Button size="sm" onClick={() => { setForm(true); setFrom(today); setTo('') }} className={cn('text-foreground', !compact && 'mt-3')}>
        <Thermometer /> Krank / Pause
      </Button>
    )
  }
  return (
    <form className={cn('flex flex-wrap items-center gap-2 rounded-card bg-secondary px-3 py-2.5 text-caption', !compact && 'mt-3')}
      onSubmit={(e) => { e.preventDefault(); m.mutate({ method: 'POST', body: { kind, from, to: to || null } }, { onSuccess: () => setForm(false) }) }}>
      <div className="inline-flex rounded-control bg-card p-0.5 shadow-hairline" role="group" aria-label="Art">
        {(['krank', 'pause'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={cn('tap rounded-control px-2.5 py-1 font-medium', kind === k ? 'bg-foreground text-background' : 'text-muted-foreground')}>{PAUSE_LABEL[k]}</button>
        ))}
      </div>
      <label className="flex items-center gap-1.5">ab
        <Input small type="date" value={from} min={day(today, -14)} onChange={(e) => setFrom(e.target.value)} required className="w-auto tabular-nums" />
      </label>
      <label className="flex items-center gap-1.5">bis
        <Input small type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-auto tabular-nums" />
      </label>
      <span className="text-muted-foreground">{to ? '' : 'leer = noch offen'}</span>
      <Button type="submit" size="sm" variant="primary" disabled={m.isPending}>Speichern</Button>
      <Button size="sm" variant="ghost" onClick={() => setForm(false)}>Abbrechen</Button>
      {m.isError && <p className="basis-full text-error">{(m.error as Error).message}</p>}
    </form>
  )
}
