'use client'

import { use } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { BEST_EFFORTS, RUN_TYPES, type RunMetrics, type RunType } from '@/lib/analytics/run-metrics'
import type { RunSummary } from '@/lib/analytics/run-view'
import type { PlanSession } from '@/lib/plan/types'
import { fmtClock, fmtNum, fmtPace } from '@/components/runs/format'
import { RunTypeTag } from '@/components/runs/tags'
import { Button } from '@/components/ui/button'
import { Card, Inset } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'
import { Select } from '@/components/ui/select'
import { StreamCharts, type StreamPoint } from '@/components/runs/StreamCharts'
import { RunMap } from '@/components/runs/RunMap'
import { SplitsChart } from '@/components/runs/SplitsChart'
import { ZonesBar } from '@/components/runs/ZonesBar'
import { Comparison, type SimilarRun } from '@/components/runs/Comparison'
import { cn } from '@/lib/utils'
import { RunInsights } from '@/components/runs/RunInsights'
import { RaceAnalysis } from '@/components/runs/RaceAnalysis'
import { runInsights } from '@/lib/insights/run'
import { dayLabel } from '@/lib/plan/effective'
import { RunFeedback, type FeedbackValue } from '@/components/runs/RunFeedback'

interface RunDetail {
  run: RunSummary
  source: string
  external: { url: string; label: string } | null
  canReload: boolean
  metrics: RunMetrics | null
  planned: PlanSession | null
  plannedDate: string | null
  temperature: number | null
  series: StreamPoint[]
  route: [number, number, number | null][] | null
  similar: SimilarRun[]
  feedback: FeedbackValue
}

const PLAN_TYPE: Record<string, RunType> = {
  easy: 'Locker', recovery: 'Regeneration', tempo: 'Tempo', intervals: 'Intervalle', speed: 'Intervalle', long: 'Longrun', race: 'Rennen',
}

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery<RunDetail>({
    queryKey: ['run', id],
    queryFn: async () => {
      const r = await fetch(`/api/running/runs/${id}`)
      if (!r.ok) throw new Error()
      return r.json()
    },
  })

  const setType = useMutation({
    mutationFn: (runType: RunType | null) =>
      fetch(`/api/running/runs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runType }) })
        .then((r) => { if (!r.ok) throw new Error() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['run', id] }); qc.invalidateQueries({ queryKey: ['runs'] }) },
  })
  const reload = useMutation({
    mutationFn: () => fetch(`/api/running/activity/${id}/enrich?force=1`, { method: 'POST' }).then((r) => { if (!r.ok) throw new Error() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run', id] }),
  })

  if (isLoading) return <div className="flex animate-pulse flex-col gap-4"><div className="h-8 w-72 rounded-control bg-secondary" /><div className="h-24 rounded-card bg-card shadow-raised" /><div className="h-80 rounded-card bg-card shadow-raised" /></div>
  if (isError || !data) return <p className="text-body-sm text-error">Dieser Lauf konnte nicht geladen werden. <Link href="/running/activities" className="underline">Zur Liste</Link></p>

  const { run, metrics: m, planned, plannedDate } = data
  const insights = runInsights({ run, metrics: m, planned, plannedDate, temperature: data.temperature, similar: data.similar })
  const plannedType = planned ? PLAN_TYPE[planned.type] : undefined
  const planMatches = planned && plannedType === run.runType && (!planned.km || Math.abs(run.km - planned.km) <= planned.km * 0.2)
  const steady = run.runType === 'Locker' || run.runType === 'Longrun' || run.runType === 'Regeneration'
  const bests = m ? BEST_EFFORTS.filter((b) => m.best[b.key] != null) : []

  return (
    <div className="flex flex-col gap-4 pb-10">
      <Link href="/running/activities" className="tap inline-flex w-fit items-center gap-1.5 text-body-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Alle Läufe
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-title">{format(parseISO(run.date), 'EEEE, d. MMMM yyyy', { locale: de })}</h1>
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
            <RunTypeTag type={run.runType} />
            <label className="sr-only" htmlFor="run-type">Lauftyp korrigieren</label>
            <Select small id="run-type" value={run.runTypeSource === 'manual' ? run.runType : ''} disabled={setType.isPending}
              onChange={(e) => setType.mutate((e.target.value || null) as RunType | null)}
              className="w-auto max-w-full text-caption">
              <option value="">{run.runTypeSource === 'plan' ? 'Typ aus dem Plan' : 'Typ automatisch erkannt'}</option>
              {RUN_TYPES.map((t) => <option key={t} value={t}>Korrigieren: {t}</option>)}
            </Select>
            <span className="min-w-0 break-words">{run.name}{run.startTime ? ` · ${run.startTime.slice(0, 5)} Uhr` : ''}{data.temperature != null ? ` · ${fmtNum(data.temperature)} °C` : ''}</span>
          </div>
        </div>
        {(data.external || data.canReload) && (
          <div className="flex flex-wrap gap-2">
            {data.external && (
              <Button asChild size="action">
                <a href={data.external.url} target="_blank" rel="noreferrer"><ExternalLink /> {data.external.label}</a>
              </Button>
            )}
            {data.canReload && (
              <Button size="action" onClick={() => reload.mutate()} disabled={reload.isPending}>
                <RefreshCw className={cn(reload.isPending && 'animate-spin')} /> {reload.isPending ? 'Lädt…' : 'Neu laden'}
              </Button>
            )}
          </div>
        )}
      </div>
      {reload.isError && <p className="text-body-sm text-error">Detaildaten konnten nicht geladen werden. Später noch einmal versuchen.</p>}

      {planned && (
        <div className={cn('rounded-card px-4 py-3 text-body-sm', planMatches ? 'bg-teal-soft' : 'bg-warning-soft')}>
          <b>{planMatches ? 'Wie geplant.' : 'Anders als geplant.'}</b>{' '}
          Geplant: {planned.title ?? plannedType ?? planned.type}{planned.km ? `, ${fmtNum(planned.km, 1)} km` : ''}{planned.pace ? ` @ ${planned.pace}` : ''}
          {plannedDate && plannedDate !== run.date ? ` (geplant für ${dayLabel(plannedDate)})` : ''}.
          {' '}Gelaufen: {run.runType}, {fmtNum(run.km, 1)} km.
          {planned.notes && <span className="mt-1 block text-muted-foreground">{planned.notes}</span>}
        </div>
      )}

      <Card>
        <RunFeedback id={run.id} value={data.feedback} onSaved={() => ['run-feedback', 'workshop'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))} />
      </Card>

      <RunInsights lines={insights} hasMetrics={!!m} />
      {run.km >= 41 && <RaceAnalysis runId={run.id} />}

      <Card as="div" className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
        <Figure label="Distanz" value={fmtNum(run.km, 2)} unit="km" />
        <Figure label="Zeit" value={fmtClock(run.movingS)} />
        <Figure label="Pace" value={fmtPace(run.paceS)} unit="/km" />
        <Figure label="Ø HF" value={run.hr ?? '–'} unit={run.hr && run.maxHr ? `max ${run.maxHr}` : undefined} />
        <Figure label="Kadenz" value={run.cadence ?? '–'} unit={run.cadence ? 'spm' : undefined} />
        <Figure label="Höhenmeter" value={fmtNum(run.elevationM)} unit={run.elevationM != null ? 'm' : undefined} />
        <Figure label="Effizienz" value={fmtNum(run.effMpb, 2)} unit={run.effMpb != null ? 'm/Schlag' : undefined} />
      </Card>

      {!m && (
        <Inset className="px-4 py-3 text-body-sm">Für diesen Lauf fehlen noch die Detaildaten.{data.canReload && ' „Neu laden“ holt sie von der Quelle.'}</Inset>
      )}

      {/* Phones: one column in reading order (order-*). From lg: two independent columns, each card at its own height. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
        <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-4">
          <Card stack title="Verlauf" aside="über die Distanz" className="order-1">
            <StreamCharts points={data.series} />
          </Card>
          <Card stack title="Kilometer" aside="Balken = Tempo, höher ist schneller" className="order-3">
            <SplitsChart splits={m?.splits ?? []} />
          </Card>
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-4">
          <Card stack title="Strecke" aside="gefärbt nach Tempo" className="order-2">
            {data.route && data.route.length > 1 ? <RunMap route={data.route} /> : <p className="text-body-sm text-muted-foreground">Keine GPS-Daten (z. B. Laufband).</p>}
          </Card>
          <Card stack title="Herzfrequenz" aside="Zeit in Zonen · HFmax 200" className="order-4">
            <ZonesBar seconds={m?.zonesS ?? []} />
            {m?.decouplingPct != null && (
              <p className={cn('rounded-card px-3 py-2.5 text-body-sm', m.decouplingPct < 5 ? 'bg-teal-soft' : 'bg-warning-soft')}>
                <b>Drift {fmtNum(m.decouplingPct, 1)} %</b>{' '}
                {steady
                  ? m.decouplingPct < 5
                    ? 'Puls und Tempo blieben bis zum Ende im Gleichgewicht: aerob stabil.'
                    : `In der zweiten Hälfte brauchtest du mehr Puls für dasselbe Tempo.${data.temperature != null && data.temperature >= 22 ? ` Bei ${fmtNum(data.temperature)} °C ist das normal.` : ''}`
                  : 'Bei Tempo- und Intervalleinheiten wenig aussagekräftig.'}
              </p>
            )}
          </Card>
          {bests.length > 0 && (
            <Card title="Schnellste Abschnitte" aside="in diesem Lauf" className="order-5">
              <ul className="grid gap-1.5 text-body-sm tabular-nums">
                {bests.map((b) => (
                  <li key={b.key} className="flex flex-wrap justify-between gap-x-3">
                    <span>{b.label}</span>
                    <span><b>{fmtClock(m!.best[b.key]!)}</b> <span className="text-muted-foreground">({fmtPace(m!.best[b.key]! / (b.m / 1000))} /km)</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card stack title={`Im Vergleich: deine ${run.runType}-Läufe`}>
        <Comparison runId={run.id} runType={run.runType} km={run.km} similar={data.similar} />
      </Card>
    </div>
  )
}
