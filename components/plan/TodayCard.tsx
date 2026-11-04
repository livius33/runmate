'use client'

import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Moon, Sun } from 'lucide-react'
import { fmtKm } from '@/lib/plan/format'
import type { TodayInsight } from '@/lib/insights/today'
import { Pill, TypeTag } from './ui'

// Today at a glance: what to run, how, why, and how yesterday went.
export function TodayCard({ today, insight, children }: { today: string; insight: TodayInsight; children?: React.ReactNode }) {
  const s = insight.session
  return (
    <section className="rounded-2xl border border-border border-l-4 border-l-brand bg-card p-4 sm:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
          <Sun className="h-4 w-4" /> Heute · {format(parseISO(today), 'EEEE d.M.', { locale: de })}
        </span>
        {s ? (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <TypeTag type={s.type} />
            <span className="font-medium">{s.title}</span>
            {s.km && <span className="text-sm text-muted-foreground tabular-nums">{fmtKm(s.km)} km</span>}
          </span>
        ) : <span className="text-sm text-muted-foreground">Ruhetag</span>}
      </div>

      {insight.targets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {insight.targets.map((t) => <Pill key={t} className="tabular-nums text-foreground">{t}</Pill>)}
        </div>
      )}

      {s?.notes && <p className="mt-3 text-sm leading-snug text-foreground/80">{s.notes}</p>}

      <p className="mt-3 text-[15px] font-semibold leading-snug">{insight.advice}</p>
      {insight.hint && <p className="mt-1 text-sm text-amber-700">{insight.hint}</p>}
      {insight.caution && <p className="mt-1 text-sm text-muted-foreground">{insight.caution}</p>}

      {insight.why.length > 0 && (
        <div className="mt-2 text-sm">
          <span className="text-muted-foreground">Warum: </span>
          {insight.why.join(' · ')}
        </div>
      )}
      {insight.yesterday && <p className="mt-2 text-sm text-muted-foreground">{insight.yesterday}</p>}
      {insight.night && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground tabular-nums">
          <Moon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {insight.night.muted ? <span>{insight.night.text}</span> : (
            <span>Letzte Nacht: {insight.night.parts.map((p, i) => (
              <span key={p.text}>{i > 0 && ' · '}<span className={p.flagged ? 'font-medium text-amber-700' : undefined}>{p.text}</span></span>
            ))}</span>
          )}
        </p>
      )}
      {children}
    </section>
  )
}
