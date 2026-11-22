'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, X } from 'lucide-react'
import { fmtClock, fmtPace } from '@/lib/plan/format'
import type { RaceAnalysisResult, Tone } from '@/lib/insights/race-analysis'
import type { PlanKind } from '@/lib/plan/race-day'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { ChipButton } from '@/components/ui/chip'

const ICON: Record<Tone, { icon: typeof Check; tone: string }> = {
  ok: { icon: Check, tone: 'text-teal' },
  warn: { icon: AlertTriangle, tone: 'text-warning' },
  bad: { icon: X, tone: 'text-brand' },
}
const km = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })
const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)} ${unit}`

// A marathon against the pacing plan: Fazit lines and one row per section.
export function RaceAnalysis({ runId, initialPlan = 'A', className }: { runId: string; initialPlan?: PlanKind; className?: string }) {
  const [plan, setPlan] = useState<PlanKind>(initialPlan)
  const { data, isLoading, isError, error } = useQuery<RaceAnalysisResult & { plan: PlanKind }>({
    queryKey: ['race-analysis', runId, plan],
    queryFn: async () => {
      const r = await fetch(`/api/running/race-analysis?id=${runId}&plan=${plan}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Rennanalyse nicht verfügbar')
      return d
    },
  })

  return (
    <Card stack title="Rennanalyse" className={className} aside={
      <span className="flex gap-1.5" role="group" aria-label="Plan">
        {(['A', 'B'] as PlanKind[]).map((k) => (
          <ChipButton key={k} selected={plan === k} onClick={() => setPlan(k)}>Plan {k}</ChipButton>
        ))}
      </span>
    }>
      {isLoading && <div className="h-24 animate-pulse rounded-card bg-secondary" />}
      {isError && <p className="text-body-sm text-muted-foreground">{(error as Error).message}</p>}
      {data && (
        <>
          <ul className="grid gap-2 text-body-sm">
            {data.lines.map((l) => {
              const { icon: Icon, tone } = ICON[l.tone]
              return (
                <li key={l.label} className="flex items-start gap-2">
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
                  <span className="min-w-0"><b>{l.label}:</b> {l.text}</span>
                </li>
              )
            })}
          </ul>
          <div className="grid text-body-sm tabular-nums">
            {data.sections.map((s) => (
              <div key={s.from} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-border py-2">
                <span className="text-muted-foreground">km {km(s.from)}–{km(s.to)}</span>
                <span>
                  <b>{fmtPace(s.paceS)}</b> <span className="text-muted-foreground">(Plan {fmtPace(s.plannedPaceS)})</span>
                  <span className="block text-caption text-muted-foreground">
                    HF Ø {s.hr ?? '–'}{s.hrCap ? ` / ${s.hrCap}` : ''}{s.overShare != null && s.overShare > 0 ? ` · ${Math.round(s.overShare * 100)} % drüber` : ''}
                  </span>
                </span>
                <span className={cn('text-right text-caption font-medium', s.lostS > 15 ? 'text-brand-text' : s.lostS < -15 ? 'text-teal-text' : 'text-muted-foreground')}>
                  {signed(s.deltaS, 's/km')}<br />{s.lostS > 0 ? `${fmtClock(s.lostS, true).replace(/^0:0?/, '')} verloren` : s.lostS < 0 ? `${fmtClock(-s.lostS, true).replace(/^0:0?/, '')} gewonnen` : 'im Plan'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
