'use client'

import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Dumbbell, Moon, Sun } from 'lucide-react'
import { fmtKm } from '@/lib/plan/format'
import type { TodayInsight } from '@/lib/insights/today'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { TypeTag } from './tags'

// Today at a glance: what to run, how, why, and how yesterday went. The brand bar on the left marks today.
export function TodayCard({ today, insight, className, children }: { today: string; insight: TodayInsight; className?: string; children?: React.ReactNode }) {
  const s = insight.session
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <span className="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-brand">
          <Sun className="h-4 w-4" /> Heute · {format(parseISO(today), 'EEEE d.M.', { locale: de })}
        </span>
        {s ? (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <TypeTag type={s.type} />
            <span className="text-body-sm font-medium">{s.title}</span>
            {s.km && <span className="text-body-sm text-muted-foreground tabular-nums">{fmtKm(s.km)} km</span>}
          </span>
        ) : <span className="text-body-sm text-muted-foreground">Ruhetag</span>}
      </div>

      {insight.targets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {insight.targets.map((t) => <Chip key={t} className="tabular-nums text-foreground">{t}</Chip>)}
        </div>
      )}

      {s?.notes && <p className="mt-3 text-body-sm text-foreground/80">{s.notes}</p>}

      <p className="mt-3 text-body font-semibold">{insight.advice}</p>
      {insight.hint && <p className="mt-1 text-body-sm text-warning">{insight.hint}</p>}
      {insight.caution && <p className="mt-1 text-body-sm text-muted-foreground">{insight.caution}</p>}
      {insight.strength && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-body-sm">
          <Dumbbell className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />{insight.strength}
        </p>
      )}

      {insight.why.length > 0 && (
        <div className="mt-2 text-body-sm">
          <span className="text-muted-foreground">Warum: </span>
          {insight.why.join(' · ')}
        </div>
      )}
      {insight.yesterday && <p className="mt-2 text-body-sm text-muted-foreground">{insight.yesterday}</p>}
      {insight.night && (
        <p className="mt-2 flex items-start gap-1.5 text-body-sm text-muted-foreground tabular-nums">
          <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {insight.night.muted ? <span>{insight.night.text}</span> : (
            <span>Letzte Nacht: {insight.night.parts.map((p, i) => (
              <span key={p.text}>{i > 0 && ' · '}<span className={p.flagged ? 'font-medium text-warning' : undefined}>{p.text}</span></span>
            ))}</span>
          )}
        </p>
      )}
      {children}
    </Card>
  )
}
