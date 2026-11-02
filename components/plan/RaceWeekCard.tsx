'use client'

import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Check, Flag } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { raceWeek, raceWeekPhase } from '@/lib/plan/race-week'
import { raceOf } from '@/lib/plan/blocks'
import { cn } from '@/lib/utils'
import { Card } from './ui'
import { Upsell, useEntitlements } from '@/components/billing/Entitlements'

type Checked = Record<string, boolean>

// Race week day by day plus a checklist that is saved (same on phone and laptop).
export function RaceWeekCard({ today }: { today: string }) {
  const phase = raceWeekPhase(today)
  const { race, days: RACE_WEEK, checklist: CHECKLIST } = raceWeek(raceOf(today))
  const qc = useQueryClient()
  const canTick = useEntitlements().features.raceDay      // the checklist is a race-day tool (Plus, Phase 4)
  const { data: checked = {} } = useQuery<Checked>({
    queryKey: ['race-checklist'],
    queryFn: () => fetch('/api/running/race-checklist').then((r) => r.json()).then((d) => d.checked ?? {}),
    enabled: phase === 'week',
  })
  const toggle = useMutation({
    mutationFn: async (v: { id: string; checked: boolean }) => {
      const r = await fetch('/api/running/race-checklist', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })
      if (!r.ok) throw new Error('Konnte nicht gespeichert werden')
      return (await r.json()).checked as Checked
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['race-checklist'] })
      const previous = qc.getQueryData<Checked>(['race-checklist'])
      qc.setQueryData<Checked>(['race-checklist'], { ...(previous ?? {}), [v.id]: v.checked })
      return { previous }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['race-checklist'], ctx?.previous ?? {}),
    onSuccess: (c) => qc.setQueryData(['race-checklist'], c),
  })

  if (phase === 'none') return null
  if (phase === 'preview') {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <Flag className="h-4 w-4 shrink-0 text-brand" />
        <span>Rennwoche ab {format(parseISO(RACE_WEEK[0].date), 'EEEEEE d.M.', { locale: de })}: {`${race.distanceKm > 40 ? 'Carb-Loading an den zwei Tagen davor' : 'am Tag davor kohlenhydratbetont essen'}, ${race.name} am ${format(parseISO(race.date), 'EEEEEE d.M.', { locale: de })}.`}</span>
      </p>
    )
  }

  const done = CHECKLIST.filter((c) => checked[c.id]).length
  return (
    <Card title="Rennwoche" aside={<span className="text-xs text-muted-foreground tabular-nums">Checkliste {done}/{CHECKLIST.length}</span>}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ol className="grid gap-2">
          {RACE_WEEK.map((d) => {
            const isToday = d.date === today, past = d.date < today
            return (
              <li key={d.date} className={cn('rounded-xl px-3.5 py-2.5', isToday ? 'border-l-4 border-l-brand bg-brand-soft/40' : 'border border-border', past && 'opacity-55')}>
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold tabular-nums">{format(parseISO(d.date), 'EEEEEE d.M.', { locale: de })}</span>
                  <span className={cn(isToday && 'font-medium')}>{d.title}</span>
                  {isToday && <span className="text-xs font-medium text-brand">heute</span>}
                </div>
                {(isToday || !past) && (
                  <ul className="mt-1 grid gap-0.5 text-[13px] text-muted-foreground">
                    {d.focus.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
        <div>
          <div className="mb-2 text-sm font-medium">Checkliste</div>
          <ul className="grid gap-1.5 text-sm">
            {CHECKLIST.map((c) => {
              const on = !!checked[c.id], due = c.due <= today && !on
              return (
                <li key={c.id}>
                  <button onClick={() => toggle.mutate({ id: c.id, checked: !on })} aria-pressed={on} disabled={!canTick}
                    className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-secondary">
                    <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border', on ? 'border-teal bg-teal text-white' : due ? 'border-brand' : 'border-border')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className={cn(on && 'text-muted-foreground line-through', due && 'text-brand')}>
                      {c.label} <span className="text-xs text-muted-foreground no-underline">· bis {format(parseISO(c.due), 'EEEEEE', { locale: de })}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {!canTick && <Upsell feature="raceDay" className="mt-2" />}
          {toggle.isError && <p className="mt-2 text-xs text-brand">Konnte nicht gespeichert werden, bitte noch einmal tippen.</p>}
        </div>
      </div>
    </Card>
  )
}
