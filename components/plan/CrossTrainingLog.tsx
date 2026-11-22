'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import type { CrossSummary } from '@/lib/analytics/cross-view'
import { CROSS_SPORTS, CROSS_TYPES, MINUTES_RANGE, type CrossType } from '@/lib/analytics/cross-training'
import { DEFAULT_RPE } from '@/lib/analytics/load'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip, ChipButton } from '@/components/ui/chip'
import { Input } from '@/components/ui/field'

// Cross-training sessions (08-04): the query, the mutations and the small pieces (RPE chips, entry form, Heute row)
// that the Heute-Karte and the Läufe page share. One query key; writes invalidate fitness and stats.

export const CROSS_KEY = ['cross-training']
const FITNESS_KEYS = [CROSS_KEY, ['running-fitness'], ['running-stats']]

export function useCrossTraining() {
  return useQuery<CrossSummary[]>({
    queryKey: CROSS_KEY,
    queryFn: () => fetch('/api/cross-training').then((r) => (r.ok ? r.json() : [])),
  })
}

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error ?? 'Speichern fehlgeschlagen')
  return data
}

export interface CrossEntryInput { date: string; sport: CrossType; minutes: number; rpe: number | null; name?: string }

export function useCrossMutations() {
  const qc = useQueryClient()
  const invalidate = () => { for (const k of FITNESS_KEYS) qc.invalidateQueries({ queryKey: k }) }
  const snapshot = async () => {
    await qc.cancelQueries({ queryKey: CROSS_KEY })
    return { prev: qc.getQueryData<CrossSummary[]>(CROSS_KEY) }
  }
  const rollback = (_e: unknown, _v: unknown, ctx?: { prev?: CrossSummary[] }) => qc.setQueryData(CROSS_KEY, ctx?.prev ?? [])

  // RPE: optimistic, rolled back if saving fails.
  const setRpe = useMutation({
    mutationFn: ({ id, rpe }: { id: string; rpe: number | null }) => send(`/api/cross-training/${id}`, 'PATCH', { rpe }) as Promise<CrossSummary>,
    onMutate: async ({ id, rpe }) => {
      const ctx = await snapshot()
      qc.setQueryData<CrossSummary[]>(CROSS_KEY, (rows = []) => rows.map((r) => (r.id === id ? { ...r, rpe } : r)))
      return ctx
    },
    onError: rollback,
    onSettled: invalidate,
  })
  const create = useMutation({
    mutationFn: (entry: CrossEntryInput) => send('/api/cross-training', 'POST', entry) as Promise<CrossSummary>,
    onSuccess: (row) => qc.setQueryData<CrossSummary[]>(CROSS_KEY, (rows = []) => [row, ...rows].sort((a, b) => b.date.localeCompare(a.date))),
    onSettled: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => send(`/api/cross-training/${id}`, 'DELETE'),
    onMutate: async (id) => {
      const ctx = await snapshot()
      qc.setQueryData<CrossSummary[]>(CROSS_KEY, (rows = []) => rows.filter((r) => r.id !== id))
      return ctx
    },
    onError: rollback,
    onSettled: invalidate,
  })
  return { setRpe, create, remove }
}

const QUICK = [5, 6, 7, 8]
const ALL = Array.from({ length: 10 }, (_, i) => i + 1)

// RPE 1–10: the usual 5–8 as chips, "andere" opens the rest. The chosen value is filled; none → "wie hart?".
export function RpeChips({ value, onChange, disabled, className }: { value: number | null; onChange: (rpe: number) => void; disabled?: boolean; className?: string }) {
  const [all, setAll] = useState(value != null && !QUICK.includes(value))
  const shown = all ? ALL : QUICK
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)} role="group" aria-label="RPE">
      <span className="mr-0.5 text-caption text-muted-foreground">{value == null ? 'wie hart?' : 'RPE'}</span>
      {shown.map((n) => (
        <button key={n} type="button" disabled={disabled} aria-pressed={value === n} onClick={() => onChange(n)}
          className={cn('tap h-7 min-w-7 rounded-control px-2 text-caption tabular-nums transition-colors disabled:opacity-50',
            value === n ? 'bg-foreground text-background' : 'bg-card text-foreground shadow-hairline hover:bg-secondary')}>
          {n}
        </button>
      ))}
      {!all && <button type="button" disabled={disabled} onClick={() => setAll(true)} className="tap px-1 text-caption text-muted-foreground hover:text-foreground">andere</button>}
    </span>
  )
}

// A session without a watch: sport, date, minutes, RPE, name. Saves through the POST route; errors come back in German.
export function CrossEntryForm({ date, onDone, onCancel }: { date: string; onDone?: (row: CrossSummary) => void; onCancel?: () => void }) {
  const { create } = useCrossMutations()
  const [sport, setSport] = useState<CrossType>('Strength')
  const [day, setDay] = useState(date)
  const [minutes, setMinutes] = useState('30')
  const [rpe, setRpe] = useState<number | null>(null)
  const [name, setName] = useState('')
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    create.mutate({ date: day, sport, minutes: Number(minutes), rpe, name: name.trim() || undefined }, { onSuccess: (row) => onDone?.(row) })
  }
  return (
    <form onSubmit={submit} className="rounded-card bg-secondary p-3 text-body-sm">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sport">
        {CROSS_TYPES.map((t) => (
          <ChipButton key={t} selected={sport === t} onClick={() => setSport(t)}>
            {CROSS_SPORTS[t].label}
          </ChipButton>
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto_1fr]">
        <label className="flex flex-col gap-1 text-caption text-muted-foreground">Datum
          <Input small type="date" value={day} max={date} onChange={(e) => setDay(e.target.value)} required className="tabular-nums" />
        </label>
        <label className="flex flex-col gap-1 text-caption text-muted-foreground">Minuten
          <Input small type="number" inputMode="numeric" min={MINUTES_RANGE[0]} max={MINUTES_RANGE[1]} value={minutes} onChange={(e) => setMinutes(e.target.value)} required
            className="w-24 tabular-nums" />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-caption text-muted-foreground sm:col-span-1">Name (optional)
          <Input small type="text" value={name} maxLength={80} placeholder={CROSS_SPORTS[sport].label} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <div className="mt-2.5"><RpeChips value={rpe} onChange={setRpe} /></div>
      {create.isError && <p className="mt-2 text-caption text-error">{(create.error as Error).message}</p>}
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={create.isPending}>
          {create.isPending ? 'Speichern…' : 'Speichern'}
        </Button>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Abbrechen</Button>}
        <span className="ml-auto text-caption text-muted-foreground">ohne RPE zählt {DEFAULT_RPE}</span>
      </div>
    </form>
  )
}

// One session as a line: sport, name, minutes (HF, km) and the RPE chips.
export function CrossSessionLine({ row, onDelete }: { row: CrossSummary; onDelete?: () => void }) {
  const { setRpe } = useCrossMutations()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body-sm">
      <span className="inline-flex items-center gap-1.5">
        <SportPill type={row.type} />
        <span className="font-medium">{row.name}</span>
        <span className="text-muted-foreground tabular-nums">{row.minutes} Min.{row.hr ? ` · HF ${row.hr}` : ''}{row.km ? ` · ${row.km.toLocaleString('de-DE')} km` : ''}</span>
      </span>
      <RpeChips value={row.rpe} onChange={(rpe) => setRpe.mutate({ id: row.id, rpe })} disabled={setRpe.isPending} />
      {onDelete && <button type="button" onClick={onDelete} className="tap text-caption text-muted-foreground hover:text-error">Löschen</button>}
    </div>
  )
}

export function SportPill({ type, className }: { type: CrossType; className?: string }) {
  return (
    <Chip tone="neutral" className={cn('text-foreground', className)}>{CROSS_SPORTS[type].label}</Chip>
  )
}

// Heute-Karte: today's sessions with their RPE, and "Einheit eintragen" for one without a watch.
export function CrossTrainingToday({ today }: { today: string }) {
  const { data: rows = [] } = useCrossTraining()
  const { remove } = useCrossMutations()
  const [adding, setAdding] = useState(false)
  const todays = rows.filter((r) => r.date === today)
  if (!todays.length && !adding) {
    return (
      <p className="mt-3 border-t border-border pt-3 text-caption text-muted-foreground">
        Kraft, Schwimmen, Rad oder Gym heute?{' '}
        <button type="button" onClick={() => setAdding(true)} className="relative inline-flex items-center gap-0.5 font-medium text-foreground before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] hover:underline">
          <Plus className="h-3 w-3" /> Einheit eintragen
        </button>
      </p>
    )
  }
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      {todays.map((r) => <CrossSessionLine key={r.id} row={r} onDelete={r.manual ? () => remove.mutate(r.id) : undefined} />)}
      {adding
        ? <CrossEntryForm date={today} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        : <button type="button" onClick={() => setAdding(true)} className="relative self-start text-caption text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] hover:text-foreground">+ weitere Einheit eintragen</button>}
    </div>
  )
}
