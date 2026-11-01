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
import { Panel, RunTypeTag, fmtClock, fmtNum, fmtPace } from '@/components/runs/format'
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
  garminActivityId: string | null
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

  if (isLoading) return <div className="flex flex-col gap-4 animate-pulse"><div className="h-8 w-72 rounded bg-secondary" /><div className="h-24 rounded-2xl bg-card border border-border" /><div className="h-80 rounded-2xl bg-card border border-border" /></div>
  if (isError || !data) return <p className="text-sm text-brand">Dieser Lauf konnte nicht geladen werden. <Link href="/running/activities" className="underline">Zur Liste</Link></p>

  const { run, metrics: m, planned, plannedDate } = data
  const insights = runInsights({ run, metrics: m, planned, plannedDate, temperature: data.temperature, similar: data.similar })
  const plannedType = planned ? PLAN_TYPE[planned.type] : undefined
  const planMatches = planned && plannedType === run.runType && (!planned.km || Math.abs(run.km - planned.km) <= planned.km * 0.2)
  const steady = run.runType === 'Locker' || run.runType === 'Longrun' || run.runType === 'Regeneration'
  const bests = m ? BEST_EFFORTS.filter((b) => m.best[b.key] != null) : []

  return (
    <div className="flex flex-col gap-4 pb-10">
      <Link href="/running/activities" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Alle Läufe
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{format(parseISO(run.date), 'EEEE, d. MMMM yyyy', { locale: de })}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <RunTypeTag type={run.runType} />
            <label className="sr-only" htmlFor="run-type">Lauftyp korrigieren</label>
            <select id="run-type" value={run.runTypeSource === 'manual' ? run.runType : ''} disabled={setType.isPending}
              onChange={(e) => setType.mutate((e.target.value || null) as RunType | null)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground">
              <option value="">{run.runTypeSource === 'plan' ? 'Typ aus dem Plan' : 'Typ automatisch erkannt'}</option>
              {RUN_TYPES.map((t) => <option key={t} value={t}>Korrigieren: {t}</option>)}
            </select>
            <span>{run.name}{run.startTime ? ` · ${run.startTime.slice(0, 5)} Uhr` : ''}{data.temperature != null ? ` · ${data.temperature} °C` : ''}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {data.garminActivityId && (
            <a href={`https://connect.garmin.com/modern/activity/${data.garminActivityId}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary">
              <ExternalLink className="h-3.5 w-3.5" /> In Garmin öffnen
            </a>
          )}
          <button onClick={() => reload.mutate()} disabled={reload.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary disabled:opacity-50">
            <RefreshCw className={cn('h-3.5 w-3.5', reload.isPending && 'animate-spin')} /> {reload.isPending ? 'Lädt…' : 'Neu laden'}
          </button>
        </div>
      </div>
      {reload.isError && <p className="text-sm text-brand">Garmin-Daten konnten nicht geladen werden. Später noch einmal versuchen.</p>}

      {planned && (
        <div className={cn('max-w-2xl rounded-xl px-4 py-3 text-sm', planMatches ? 'bg-teal-soft/70' : 'bg-amber-50')}>
          <b>{planMatches ? 'Wie geplant.' : 'Anders als geplant.'}</b>{' '}
          Geplant: {planned.title ?? plannedType ?? planned.type}{planned.km ? `, ${fmtNum(planned.km, 1)} km` : ''}{planned.pace ? ` @ ${planned.pace}` : ''}
          {plannedDate && plannedDate !== run.date ? ` (geplant für ${dayLabel(plannedDate)})` : ''}.
          {' '}Gelaufen: {run.runType}, {fmtNum(run.km, 1)} km.
          {planned.notes && <span className="block mt-1 text-muted-foreground">{planned.notes}</span>}
        </div>
      )}

      <Panel sub="RPE, Gefühl, Schmerzen – fließt in „Plan anpassen“ ein">
        <RunFeedback id={run.id} value={data.feedback} onSaved={() => ['run-feedback', 'workshop'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))} />
      </Panel>

      <RunInsights lines={insights} hasMetrics={!!m} />
      {run.km >= 41 && <RaceAnalysis runId={run.id} />}

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4 lg:grid-cols-7 tabular-nums">
        {[
          ['Distanz', `${fmtNum(run.km, 2)} km`],
          ['Zeit', fmtClock(run.movingS)],
          ['Pace', `${fmtPace(run.paceS)} /km`],
          ['Ø HF', run.hr ? <>{run.hr}<span className="ml-1 text-xs font-normal text-muted-foreground">max {run.maxHr}</span></> : '–'],
          ['Kadenz', run.cadence ? `${run.cadence} spm` : '–'],
          ['Höhenmeter', run.elevationM != null ? `${run.elevationM} m` : '–'],
          ['Effizienz', run.effMpb != null ? `${fmtNum(run.effMpb, 2)} m/Schlag` : '–'],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-lg font-semibold tracking-tight">{value}</div>
          </div>
        ))}
      </div>

      {!m && (
        <p className="rounded-xl bg-secondary px-4 py-3 text-sm">Für diesen Lauf fehlen noch die Detaildaten. „Neu laden“ holt sie von Garmin.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel title="Verlauf" sub="über die Distanz" className="lg:col-span-7">
          <StreamCharts points={data.series} />
        </Panel>
        <Panel title="Strecke" sub="gefärbt nach Tempo" className="lg:col-span-5">
          {data.route && data.route.length > 1 ? <RunMap route={data.route} /> : <p className="text-sm text-muted-foreground">Keine GPS-Daten (z. B. Laufband).</p>}
        </Panel>

        <Panel title="Kilometer" sub="Balken = Tempo, höher ist schneller" className="lg:col-span-7">
          <SplitsChart splits={m?.splits ?? []} />
        </Panel>
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Panel title="Herzfrequenz" sub="Zeit in Zonen · HFmax 200">
            <ZonesBar seconds={m?.zonesS ?? []} />
            {m?.decouplingPct != null && (
              <p className={cn('rounded-xl px-3.5 py-2.5 text-sm', m.decouplingPct < 5 ? 'bg-teal-soft/70' : 'bg-amber-50')}>
                <b>Drift {fmtNum(m.decouplingPct, 1)} %</b>{' '}
                {steady
                  ? m.decouplingPct < 5
                    ? 'Puls und Tempo blieben bis zum Ende im Gleichgewicht: aerob stabil.'
                    : `In der zweiten Hälfte brauchtest du mehr Puls für dasselbe Tempo.${data.temperature != null && data.temperature >= 22 ? ` Bei ${data.temperature} °C ist das normal.` : ''}`
                  : 'Bei Tempo- und Intervalleinheiten wenig aussagekräftig.'}
              </p>
            )}
          </Panel>
          {bests.length > 0 && (
            <Panel title="Schnellste Abschnitte" sub="in diesem Lauf">
              <ul className="grid gap-1.5 text-sm tabular-nums">
                {bests.map((b) => (
                  <li key={b.key} className="flex justify-between gap-3">
                    <span>{b.label}</span>
                    <span><b>{fmtClock(m!.best[b.key]!)}</b> <span className="text-muted-foreground">({fmtPace(m!.best[b.key]! / (b.m / 1000))} /km)</span></span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title={`Im Vergleich: deine ${run.runType}-Läufe`} className="lg:col-span-12">
          <Comparison runId={run.id} runType={run.runType} km={run.km} similar={data.similar} />
        </Panel>
      </div>
    </div>
  )
}
