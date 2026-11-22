'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { AlertTriangle, Flag } from 'lucide-react'
import { useToday } from '@/lib/use-today'
import Link from 'next/link'
import { NO_BLOCK, hasBlocks, raceOf } from '@/lib/plan/blocks'
import { useAppHref } from '@/components/AppBase'
import { fmtClock, fmtKm, fmtPace } from '@/lib/plan/format'
import { effectiveSessions, type Overrides } from '@/lib/plan/effective'
import { EMPTY_ENGINE, type EngineState } from '@/lib/plan/engine'
import type { DatedRun } from '@/lib/plan/pace-check'
import { raceWeek } from '@/lib/plan/race-week'
import { checkpoints, clockAt, decidePlan, gelPlan, racePlan, type PlanKind } from '@/lib/plan/race-day'
import type { DayActual } from '@/app/api/running/plan-actuals/route'
import { cn } from '@/lib/utils'
import { RaceAnalysis } from '@/components/runs/RaceAnalysis'
import { Button, Card, Chip, ChipButton, Inset } from '@/components/ui'
import { CourseMap } from '@/components/plan/CourseMap'
import { parseGpx, type Course } from '@/lib/plan/course'
import { usePauses } from '@/components/plan/PauseControl'
import { Upsell, useEntitlements } from '@/components/billing/Entitlements'

// Race-day tools are part of Plus (Phase 4); without it the page shows the upsell.
export default function RaceDayPage() {
  const { features } = useEntitlements()
  const today = useToday()
  const href = useAppHref()
  if (!features.raceDay) return <div className="mx-auto max-w-xl py-6"><Upsell feature="raceDay" /></div>
  // No race in the season (base block only): nothing to plan a race day for.
  if (raceOf(today).date === NO_BLOCK.race.date) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <Card>
          <p className="text-body-sm font-medium">Noch kein Rennen.</p>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Leg in der Saison ein Rennen an und übernimm einen Plan dafür. Dann stehen hier Renntempo, Zwischenzeiten, Gels und der Ablauf für deinen Renntag.
          </p>
          <Button asChild variant="primary" className="mt-3"><Link href={href('/season')}>Zur Saison</Link></Button>
        </Card>
      </div>
    )
  }
  return <RaceDayTools />
}

// Race morning on the phone: which plan, when to eat, which pace, when to gel — for the race of today's block (07-15).
function RaceDayTools() {
  const today = useToday()
  const RACE = raceOf(today)
  const { wake: WAKE_TIME, breakfast: BREAKFAST_TIME } = raceWeek(RACE)
  const start = RACE.startTime ?? '09:00'
  const { data: overrides = {} } = useQuery<Overrides>({
    queryKey: ['plan-overrides'],
    queryFn: () => fetch('/api/running/plan-overrides').then((r) => r.json()).then((d) => d.overrides ?? {}),
  })
  const { data: engine = EMPTY_ENGINE } = useQuery<EngineState>({
    queryKey: ['plan-engine'],
    queryFn: () => fetch('/api/running/plan-engine').then((r) => (r.ok ? r.json() : EMPTY_ENGINE)),
  })
  const { data: actualList = [] } = useQuery<DayActual[]>({
    queryKey: ['plan-actuals'],
    queryFn: () => fetch('/api/running/plan-actuals').then((r) => (r.ok ? r.json() : [])),
  })

  const { data: course, isLoading: courseLoading } = useQuery<Course | null>({
    queryKey: ['course-gpx', RACE.gpxPath],
    enabled: !!RACE.gpxPath,
    queryFn: async () => {
      const r = await fetch(RACE.gpxPath!)
      return r.ok ? parseGpx(await r.text()) : null
    },
    staleTime: Infinity,
  })

  const { data: pauses = [] } = usePauses()
  const decision = useMemo(() => {
    const sessions = effectiveSessions(overrides, engine.overrides, { pauses, today })
    const runs: DatedRun[] = actualList.flatMap((a) => a.runs.map((r) => ({ ...r, date: a.date })))
    return decidePlan({ today, engineLog: engine.log, sessions, runs })
  }, [today, overrides, engine, actualList, pauses])  // eslint-disable-line react-hooks/exhaustive-deps
  const [chosen, setChosen] = useState<PlanKind | null>(null)
  const [moreGels, setMoreGels] = useState(false)
  const kind = chosen ?? decision.kind
  const plan = racePlan(kind, RACE)
  const points = checkpoints(plan, RACE)
  const gels = gelPlan(plan, moreGels, RACE)
  const goal = kind === 'A' ? RACE.goalS : points[points.length - 1].elapsedS
  const daysLeft = differenceInCalendarDays(parseISO(RACE.date), parseISO(today))
  // From race day on: the race run (≥ 97 % of the distance on race day), analysed against the chosen plan.
  const raceRun = daysLeft <= 0 ? actualList.find((a) => a.date === RACE.date)?.runs.find((r) => r.km >= RACE.distanceKm * 0.97) : undefined

  const gelKm = new Set(gels.gels.map((g) => g.km).filter((k): k is number => k != null))

  if (!hasBlocks()) return (
    <Card title="Renntag">
      <p className="text-body-sm text-muted-foreground">Noch kein Rennen geplant: Die Renntag-Seite erscheint, sobald ein Trainingsblock mit Zielrennen aktiv ist.</p>
    </Card>
  )

  // Layout (12-02): title and race analysis full width. From lg up two independent columns (7 / 5), every card at its
  // natural height: plan and splits left, morning and gels right. On phones the column wrappers dissolve (`contents`)
  // and `order` keeps the race-morning order (plan, morning, splits, gels). Course map full width at the bottom.
  const col = 'contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4'
  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title sm:text-display">{RACE.name}</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {format(parseISO(RACE.date), 'EEEE, d. MMMM yyyy', { locale: de })} · Start {RACE.startTime ?? 'noch offen'}
            {daysLeft > 0 ? ` · noch ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'}` : daysLeft === 0 ? ' · heute!' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Plan wählen">
          {(['A', 'B'] as PlanKind[]).map((k) => (
            <ChipButton key={k} selected={kind === k} onClick={() => setChosen(k)} className="tabular-nums">
              {k === 'A' ? `Plan A · ${fmtClock(RACE.goalS)}` : `Plan B · ${fmtClock(RACE.fallbackS)}`}
            </ChipButton>
          ))}
        </div>
      </div>

      {raceRun && <RaceAnalysis runId={raceRun.id} initialPlan={kind} />}

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className={cn(col, 'lg:col-span-7')}>
          <Card className="border-l-4 border-l-brand max-lg:order-1">
            <div className="flex items-center gap-2 text-body-sm font-semibold text-brand-text"><Flag className="h-4 w-4" /> Plan {kind}</div>
            <p className="mt-2 text-display tabular-nums">{fmtClock(goal, true)}</p>
            <p className="mt-1 text-body-sm">{kind === 'A'
              ? `Die ersten ${fmtKm(plan[0].to)} km in ${fmtPace(plan[0].paceS)}, dann ${fmtPace(plan[1].paceS)}.`
              : `${fmtPace(RACE.fallbackPaceS)} gleichmäßig.`}{plan[1]?.hrCap ? ` HF bis km ${Math.round(plan[1].to)} unter ${plan[1].hrCap}.` : ''}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {plan.map((s, i) => (
                <Inset key={s.from}>
                  <div className="text-caption tabular-nums text-muted-foreground">km {fmtKm(s.from)}–{fmtKm(s.to)}</div>
                  <div className="text-body font-semibold tabular-nums">{fmtPace(s.paceS)}/km</div>
                  <div className="text-caption text-muted-foreground">{s.hrCap ? `HF < ${s.hrCap}` : i === plan.length - 1 ? 'alles, was da ist' : 'nach Tempo'}</div>
                </Inset>
              ))}
            </div>
            <p className="mt-3 text-caption text-muted-foreground">{decision.reason}{chosen && chosen !== decision.kind ? ' (von dir umgestellt)' : ''}</p>
            {decision.warning && <p className="mt-2 flex items-start gap-1.5 text-caption text-warning"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{decision.warning}</p>}
          </Card>

          <Card title="Zwischenzeiten" aside={<span>Uhrzeit bei Start {start}</span>} className="max-lg:order-3">
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm tabular-nums">
                <thead>
                  <tr className="text-left text-caption text-muted-foreground">
                    <th className="pb-2 font-normal">Punkt</th>
                    <th className="pb-2 font-normal">Laufzeit</th>
                    <th className="pb-2 font-normal">Uhrzeit</th>
                    <th className="pb-2 font-normal">Tempo</th>
                    <th className="pb-2 font-normal">HF</th>
                    <th className="pb-2 font-normal text-right">Gel</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((c) => (
                    <tr key={c.label} className="border-t border-border">
                      <td className="py-2 pr-3 whitespace-nowrap">{c.label}</td>
                      <td className="py-2 pr-3 text-body font-semibold whitespace-nowrap">{c.time}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{c.clock}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtPace(c.paceS)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{c.hrCap ? `< ${c.hrCap}` : c.km > plan[plan.length - 1].from ? 'alles' : '–'}</td>
                      <td className="py-2 text-right">{gelKm.has(c.km) ? <Chip tone="warning">Gel</Chip> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className={cn(col, 'lg:col-span-5')}>
          <Card title="Morgen" className="max-lg:order-2">
            {[
              [WAKE_TIME, 'Aufstehen'],
              [BREAKFAST_TIME, 'Frühstück: Weißbrot mit Honig, Banane'],
              [clockAt(-30 * 60, start), 'Im Startbereich, Toilette, locker einlaufen'],
              [clockAt(-15 * 60, start), 'Erstes Gel mit Wasser'],
              [start, RACE.startTime ? 'Start' : 'Start (Uhrzeit noch offen)'],
            ].map(([t, what]) => <Row key={t} big={t} text={what} />)}
          </Card>

          <Card title="Gels" className="max-lg:order-4" aside={
            <Button variant="ghost" size="sm" onClick={() => setMoreGels(!moreGels)} className="-mr-2">
              {moreGels ? 'Standard' : 'mehr (geübter Magen)'}
            </Button>
          }>
            {gels.gels.map((g) => <Row key={g.label} big={g.clock} text={g.label === 'vor dem Start' ? 'vor dem Start' : `bei ${g.label}`} />)}
            <p className="mt-2 text-caption text-muted-foreground">
              {gels.gels.length} × 25 g ≈ {gels.gPerHour} g pro Stunde, jedes Gel mit Wasser an der nächsten Verpflegungsstelle.
            </p>
          </Card>
        </div>

        {RACE.gpxPath && <div className="min-w-0 max-lg:order-5 lg:col-span-12">
          <CourseMap race={RACE} course={course ?? null} status={courseLoading ? 'loading' : course ? 'ready' : 'missing'} />
        </div>}
      </div>
    </div>
  )
}

function Row({ big, text }: { big: string; text: string }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-border py-2 first:border-t-0">
      <span className="w-16 shrink-0 text-title-sm tabular-nums">{big}</span>
      <span className="min-w-0 text-body-sm">{text}</span>
    </div>
  )
}
