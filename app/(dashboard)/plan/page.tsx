'use client'

import { useToday } from '@/lib/use-today'
import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { activeBlock, hasBlocks, isAfterRace } from '@/lib/plan/blocks'
import { parseGpx, type Course } from '@/lib/plan/course'
import { effectiveSessions, type Overrides } from '@/lib/plan/effective'
import type { DayActual } from '@/app/api/running/plan-actuals/route'
import { PlanHeader } from '@/components/plan/PlanHeader'
import { TrainingSchedule } from '@/components/plan/TrainingSchedule'
import { ReadinessCard } from '@/components/plan/ReadinessCard'
import { CourseMap } from '@/components/plan/CourseMap'
import { RaceStrategy } from '@/components/plan/RaceStrategy'
import { VolumeCard } from '@/components/plan/VolumeCard'
import { RulesCard } from '@/components/plan/RulesCard'
import { PaceCard } from '@/components/plan/PaceCard'
import { PlanChanges } from '@/components/plan/PlanChanges'
import { EngineSuggestions } from '@/components/plan/EngineSuggestions'
import type { EngineResult } from '@/lib/plan/engine-store'
import { PauseControl, usePauses } from '@/components/plan/PauseControl'
import { TodayCard } from '@/components/plan/TodayCard'
import { CrossTrainingToday, useCrossTraining } from '@/components/plan/CrossTrainingLog'
import { CROSS_SPORTS } from '@/lib/analytics/cross-training'
import { KB, kbDoneDates, syncedThroughOf } from '@/lib/plan/strength'
import { todayLocal } from '@/lib/dates'
import type { SourcesResponse } from '@/lib/sources/types'
import { TodayFeedback } from '@/components/plan/TodayFeedback'
import { NextPlanCard } from '@/components/plan/NextPlan'
import { RaceWeekCard } from '@/components/plan/RaceWeekCard'
import { todayInsight } from '@/lib/insights/today'
import { racePrediction } from '@/lib/insights/prediction'
import { raceReadiness } from '@/lib/insights/readiness'
import { recoveryStatus } from '@/lib/insights/recovery'
import { BASE_NOTE, baseStatus } from '@/lib/insights/base'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PredictionCard } from '@/components/plan/PredictionCard'
import { WeekReview } from '@/components/plan/WeekReview'
import type { DatedRun } from '@/lib/plan/pace-check'
import { EMPTY_ENGINE, withoutRebalance, type EngineState } from '@/lib/plan/engine'
import { recoveryDay, type WellnessNight } from '@/lib/analytics/recovery-data'

// A plan edit the server refused, with its reason (shown in the editor instead of "Erneut versuchen").
class Refused extends Error {}

export default function PlanPage() {
  const today = useToday()

  const { data: actualList = [] } = useQuery<DayActual[]>({
    queryKey: ['plan-actuals'],
    queryFn: () => fetch('/api/running/plan-actuals').then((r) => (r.ok ? r.json() : [])),
  })
  const { data: stats } = useQuery<{ acwr?: number; acwrRecent?: (number | null)[] }>({
    queryKey: ['running-stats'],
    queryFn: () => fetch('/api/running/stats').then((r) => r.json()),
  })
  const { data: fitness = [] } = useQuery<{ date: string; ctl: number; atl: number; tsb: number }[]>({
    queryKey: ['running-fitness'],
    queryFn: () => fetch('/api/running/fitness').then((r) => r.json()),
    staleTime: 30 * 60 * 1000,
  })
  const { data: course, isLoading: courseLoading } = useQuery<Course | null>({
    queryKey: ['course-gpx', activeBlock(today).race.gpxPath],
    queryFn: async () => {
      const gpx = activeBlock(today).race.gpxPath
      if (!gpx) return null
      const r = await fetch(gpx)
      return r.ok ? parseGpx(await r.text()) : null
    },
    staleTime: Infinity,
  })

  const qc = useQueryClient()
  const { data: overrides = {} } = useQuery<Overrides>({
    queryKey: ['plan-overrides'],
    queryFn: () => fetch('/api/running/plan-overrides').then((r) => r.json()).then((d) => d.overrides ?? {}),
  })
  // Optimistic: the page updates at once and rolls back if saving fails.
  const save = useMutation({
    mutationFn: async (next: Overrides) => {
      const r = await fetch('/api/running/plan-overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: next }),
      })
      if (r.ok) return
      // A refused edit (400) comes with its reason; anything else is a failed save that a retry may fix.
      const data = r.status === 400 ? await r.json().catch(() => null) : null
      throw typeof data?.error === 'string' ? new Refused(data.error) : new Error('Speichern fehlgeschlagen')
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ['plan-overrides'] })
      const previous = qc.getQueryData<Overrides>(['plan-overrides'])
      qc.setQueryData(['plan-overrides'], next)
      return { previous }
    },
    onError: (_err, _next, ctx) => qc.setQueryData(['plan-overrides'], ctx?.previous ?? {}),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['plan-overrides'] })
      qc.invalidateQueries({ queryKey: ['running-stats'] })
    },
  })

  // Plan engine: run once when the page opens, then show its changes and log.
  // Without Plus the POST returns suggestions instead of applying them (Phase 4); a refetch keeps the last ones.
  const { data: engine = EMPTY_ENGINE as EngineResult } = useQuery<EngineResult>({
    queryKey: ['plan-engine'],
    queryFn: () => fetch('/api/running/plan-engine').then((r) => (r.ok ? r.json() : EMPTY_ENGINE))
      .then((s: EngineState) => ({ ...s, suggestions: qc.getQueryData<EngineResult>(['plan-engine'])?.suggestions })),
  })
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    fetch('/api/running/plan-engine', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: EngineResult | null) => s && qc.setQueryData(['plan-engine'], s))
      .catch(() => {})
  }, [qc])
  const undo = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch('/api/running/plan-engine/undo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Zurücknehmen fehlgeschlagen')
      return data as EngineState
    },
    onSuccess: (s) => qc.setQueryData(['plan-engine'], s),
  })
  const decide = useMutation({
    mutationFn: async ({ key, decline }: { key: string; decline: boolean }) => {
      const r = await fetch('/api/running/plan-engine/suggestion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, decline }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Vorschlag konnte nicht gespeichert werden')
      return data as EngineResult
    },
    onSuccess: (s) => qc.setQueryData(['plan-engine'], s),
  })

  const { data: pauses = [] } = usePauses()
  const pauseInput = useMemo(() => ({ pauses, today }), [pauses, today])
  const sessions = useMemo(() => effectiveSessions(overrides, engine.overrides, pauseInput), [overrides, engine.overrides, pauseInput])
  // What manual edits work on: the plan without the engine's 'Ausgleich' km, so moves never carry them.
  const baseSessions = useMemo(() => effectiveSessions(overrides, withoutRebalance(engine), pauseInput), [overrides, engine, pauseInput])
  // The plan as shown without manual edits: where it differs from the plan file, an edit back at the plan value stays.
  const autoSessions = useMemo(() => effectiveSessions({}, engine.overrides, pauseInput), [engine.overrides, pauseInput])
  // date → reason of the latest active engine change on that day
  const engineNotes = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of engine.log) if (c.status === 'active') for (const d of Object.keys(c.after)) m.set(d, c.reason)
    return m
  }, [engine.log])
  const actuals = useMemo(() => new Map(actualList.map((a) => [a.date, a])), [actualList])
  // Cross-training sessions per day for the week grid pills (08-04)
  const { data: crossList = [] } = useCrossTraining()
  const cross = useMemo(() => {
    const m = new Map<string, { letter: string; label: string; kb: boolean }[]>()
    for (const r of crossList) m.set(r.date, [...(m.get(r.date) ?? []), { letter: CROSS_SPORTS[r.type].letter, label: `${r.label} ${r.minutes} Min.`, kb: KB.doneTypes.includes(r.type) }])
    return m
  }, [crossList])
  // Nights (sleep, HRV, resting HR): nothing is shown without a source that delivers them.
  const { data: wellnessData } = useQuery<{ available: boolean; nights: WellnessNight[] }>({
    queryKey: ['running-wellness'],
    queryFn: () => fetch('/api/running/wellness?days=7').then((r) => (r.ok ? r.json() : { available: false, nights: [] })),
    staleTime: 10 * 60 * 1000,
  })
  const wellness = wellnessData?.available ? wellnessData.nights : undefined
  const recoveryToday = useMemo(() => (wellness ? recoveryDay(wellness, today) : undefined), [wellness, today])
  // Kettlebell markers: done = a Strength or Gym session that day; "ausgelassen" only for days a sync covers.
  const kbDone = useMemo(() => kbDoneDates(crossList), [crossList])
  const { data: sources } = useQuery<SourcesResponse>({
    queryKey: ['sources'],
    queryFn: () => fetch('/api/sources').then((r) => r.json()),
    staleTime: 60_000,
  })
  const syncedThrough = syncedThroughOf(sources?.lastSync, (d) => todayLocal(d))
  const tsb = fitness.length ? fitness[fitness.length - 1].tsb : null
  const runs: DatedRun[] = useMemo(() => actualList.flatMap((a) => a.runs.map((r) => ({ ...r, date: a.date }))), [actualList])
  const insight = useMemo(
    () => todayInsight({ today, sessions, manual: overrides, engineLog: engine.log, runs, tsb, acwr: stats?.acwr ?? null, acwrRecent: stats?.acwrRecent, recovery: recoveryToday }),
    [today, sessions, overrides, engine.log, runs, tsb, stats?.acwr, stats?.acwrRecent, recoveryToday])
  const prediction = useMemo(() => racePrediction({ today, sessions, runs }), [today, sessions, runs])
  const readiness = useMemo(
    () => raceReadiness({ today, sessions, runs, prediction, fitness, acwr: stats?.acwr ?? null, wellness }),
    [today, sessions, runs, prediction, fitness, stats?.acwr, wellness])
  const base = !!activeBlock(today).base                     // rolling base block between goal blocks (07-17)
  const afterRace = isAfterRace(today) && !base
  // Course map, pacing strategy and the race analysis card need the race's GPX; race week works for every block (07-15).
  const race = activeBlock(today).race
  const withCourse = !!race.gpxPath
  const recovery = useMemo(() => recoveryStatus({ today, sessions, runs, fitness, wellness }), [today, sessions, runs, fitness, wellness])
  const baseCard = useMemo(() => baseStatus({ today, sessions, runs }), [today, sessions, runs])

  // Fresh install: no training block yet (no generated block live, no plan file registered).
  if (!hasBlocks()) return (
    <div className="flex flex-col gap-4 pb-10">
      <Card title="Noch kein Trainingsplan">
        <p className="text-body-sm text-muted-foreground">
          Lege auf der Saison-Seite ein Hauptrennen an und erstelle dafür einen Plan. Danach erscheinen hier Woche,
          heutige Einheit und Rennbereitschaft.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-body-sm font-medium">
          <Link href="/season" className="text-brand hover:underline">Zur Saison →</Link>
          <Link href="/plan/neu" className="text-brand hover:underline">Plan erstellen →</Link>
        </div>
      </Card>
    </div>
  )

  // Layout (12-02): Today and the plan with the week strip span the full width. Below them two independent columns
  // from lg up (7 / 5), every card at its natural height, nothing stretched to a neighbour; the right column starts
  // with the readiness verdict. On phones the column wrappers dissolve (`contents`) and `order` keeps the reading order.
  const showPrediction = !afterRace && !base
  const col = 'contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4'
  return (
    <div className="flex flex-col gap-4 pb-10">
      <PlanHeader today={today} />

      <TodayCard today={today} insight={insight}>
        <TodayFeedback today={today} sessions={sessions} runs={runs} pauses={pauseInput} />
        <PauseControl today={today} />
        <CrossTrainingToday today={today} />
      </TodayCard>
      <NextPlanCard today={today} />
      <RaceWeekCard today={today} />

      <TrainingSchedule today={today} actuals={actuals} cross={cross} kbDone={kbDone} syncedThrough={syncedThrough} sessions={sessions}
        overrides={overrides} baseSessions={baseSessions} autoSessions={autoSessions} engineOverrides={engine.overrides} engineNotes={engineNotes} onChange={(next) => save.mutate(next)} saving={save.isPending}
        saveError={save.isError} saveMessage={save.error instanceof Refused ? save.error.message : undefined} onRetry={() => save.variables && save.mutate(save.variables)} />

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className={cn(col, 'lg:col-span-7')}>
          {!!engine.suggestions?.length && <div className="min-w-0 max-lg:order-6"><EngineSuggestions suggestions={engine.suggestions}
            onDecide={(key, decline) => decide.mutate({ key, decline })} busy={decide.isPending}
            error={decide.isError ? (decide.error as Error).message : null} /></div>}
          {withCourse && <div className="min-w-0 max-lg:order-2"><CourseMap race={race} course={course ?? null} status={courseLoading ? 'loading' : course ? 'ready' : 'missing'} /></div>}
          <div className="min-w-0 max-lg:order-4"><VolumeCard today={today} actuals={actuals} /></div>
          <div className="min-w-0 max-lg:order-5"><PaceCard today={today} sessions={sessions} actuals={actuals} /></div>
          <PlanChanges className="min-w-0 max-lg:order-7" log={engine.log} onUndo={(id) => undo.mutate(id)} busy={undo.isPending}
            error={undo.isError ? (undo.error as Error).message : null} />
          <WeekReview className="min-w-0 max-lg:order-9" today={today} sessions={sessions} runs={runs} fitness={fitness} engineLog={engine.log} />
        </div>
        <div className={cn(col, 'lg:col-span-5')}>
          {base
            ? <ReadinessCard className="max-lg:order-1" title="Grundlage" verdict={baseCard.verdict} lines={baseCard.lines} note={BASE_NOTE} />
            : afterRace
            ? <ReadinessCard className="max-lg:order-1" title="Erholung" verdict={recovery.verdict} lines={recovery.lines} note={recovery.note} />
            : <ReadinessCard className="max-lg:order-1" verdict={readiness.verdict} lines={readiness.lines} note={readiness.note} />}
          {withCourse && <div className="min-w-0 max-lg:order-3">{afterRace
            ? <Card title={`Rennanalyse ${race.shortName}`}>
                <p className="text-body-sm text-muted-foreground">Dein Rennen gegen den Pacing-Plan, Abschnitt für Abschnitt.</p>
                <Link href="/race" className="mt-3 inline-block text-body-sm font-medium text-brand hover:underline">Zur Rennanalyse →</Link>
              </Card>
            : <RaceStrategy race={race} course={course ?? null} />}</div>}
          {showPrediction && <div className="min-w-0 max-lg:order-8"><PredictionCard prediction={prediction} today={today} /></div>}
          <div className="min-w-0 max-lg:order-10"><RulesCard today={today} /></div>
        </div>
      </div>
    </div>
  )
}
