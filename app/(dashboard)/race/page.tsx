'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { AlertTriangle, Flag } from 'lucide-react'
import { useToday } from '@/lib/use-today'
import { hasBlocks, raceOf } from '@/lib/plan/blocks'
import { fmtClock, fmtPace } from '@/lib/plan/format'
import { effectiveSessions, type Overrides } from '@/lib/plan/effective'
import { EMPTY_ENGINE, type EngineState } from '@/lib/plan/engine'
import type { DatedRun } from '@/lib/plan/pace-check'
import { raceWeek } from '@/lib/plan/race-week'
import { checkpoints, clockAt, decidePlan, gelPlan, racePlan, type PlanKind } from '@/lib/plan/race-day'
import type { DayActual } from '@/app/api/running/plan-actuals/route'
import { cn } from '@/lib/utils'
import { RaceAnalysis } from '@/components/runs/RaceAnalysis'
import { Card } from '@/components/plan/ui'
import { CourseMap } from '@/components/plan/CourseMap'
import { parseGpx, type Course } from '@/lib/plan/course'
import { usePauses } from '@/components/plan/PauseControl'

// Race morning on the phone: which plan, when to eat, which pace, when to gel — for the race of today's block (07-15).
export default function RaceDayPage() {
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
      <p className="text-sm text-muted-foreground">Noch kein Rennen geplant: Die Renntag-Seite erscheint, sobald ein Trainingsblock mit Zielrennen aktiv ist.</p>
    </Card>
  )

  // Phone: one column in race-morning order. Wide screens: plan + morning side by side,
  // splits + gels below, course map at the bottom.
  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">{RACE.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(parseISO(RACE.date), 'EEEE, d. MMMM yyyy', { locale: de })} · Start {RACE.startTime ?? 'noch offen'}
            {daysLeft > 0 ? ` · noch ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'}` : daysLeft === 0 ? ' · heute!' : ''}
          </p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Plan wählen">
          {(['A', 'B'] as PlanKind[]).map((k) => (
            <button key={k} onClick={() => setChosen(k)} aria-pressed={kind === k}
              className={cn('rounded-full border px-3 py-1 text-xs', kind === k ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')}>
              {k === 'A' ? `Plan A · ${fmtClock(RACE.goalS)}` : `Plan B · ${fmtClock(RACE.fallbackS)}`}
            </button>
          ))}
        </div>
      </div>

      {raceRun && <RaceAnalysis runId={raceRun.id} initialPlan={kind} />}

      <div className="grid gap-5 lg:grid-cols-12">
        <section className="min-w-0 rounded-2xl border border-border border-l-4 border-l-brand bg-card p-4 sm:p-5 lg:col-span-7">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand"><Flag className="h-4 w-4" /> Plan {kind}</div>
          <p className="mt-2 text-[34px] font-semibold leading-tight tabular-nums">{fmtClock(goal, true)}</p>
          <p className="mt-1 text-sm">{kind === 'A'
            ? `Die ersten ${plan[0].to.toLocaleString('de-DE')} km in ${fmtPace(plan[0].paceS)}, dann ${fmtPace(plan[1].paceS)}.`
            : `${fmtPace(RACE.fallbackPaceS)} gleichmäßig.`}{plan[1]?.hrCap ? ` HF bis km ${Math.round(plan[1].to)} unter ${plan[1].hrCap}.` : ''}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {plan.map((s) => (
              <div key={s.from} className="rounded-xl bg-secondary/60 px-3 py-2">
                <div className="text-xs text-muted-foreground tabular-nums">km {kmDe(s.from)}–{kmDe(s.to)}</div>
                <div className="text-base font-semibold tabular-nums">{fmtPace(s.paceS)}/km</div>
                <div className="text-xs text-muted-foreground">{s.hrCap ? `HF < ${s.hrCap}` : 'alles, was da ist'}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{decision.reason}{chosen && chosen !== decision.kind ? ' (von dir umgestellt)' : ''}</p>
          {decision.warning && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{decision.warning}</p>}
        </section>

        <div className="min-w-0 lg:col-span-5">
          <Card title="Morgen">
            {[
              [WAKE_TIME, 'Aufstehen'],
              [BREAKFAST_TIME, 'Frühstück: Weißbrot mit Honig, Banane'],
              [clockAt(-30 * 60, start), 'Im Startbereich, Toilette, locker einlaufen'],
              [clockAt(-15 * 60, start), 'Erstes Gel mit Wasser'],
              [start, RACE.startTime ? 'Start' : 'Start (Uhrzeit noch offen)'],
            ].map(([t, what]) => <Row key={t} big={t} text={what} />)}
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-7">
          <Card title="Zwischenzeiten" aside={<span className="text-xs text-muted-foreground">Uhrzeit bei Start {start}</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
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
                      <td className="py-2 pr-3 text-base font-semibold whitespace-nowrap">{c.time}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{c.clock}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtPace(c.paceS)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{c.hrCap ? `< ${c.hrCap}` : 'alles'}</td>
                      <td className="py-2 text-right">{gelKm.has(c.km) ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Gel</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-5">
          <Card title="Gels" aside={
            <button onClick={() => setMoreGels(!moreGels)} className="text-xs text-muted-foreground underline underline-offset-2">
              {moreGels ? 'Standard' : 'mehr (geübter Magen)'}
            </button>
          }>
            {gels.gels.map((g) => <Row key={g.label} big={g.clock} text={g.label === 'vor dem Start' ? 'vor dem Start' : `bei ${g.label}`} />)}
            <p className="mt-2 text-xs text-muted-foreground">
              {gels.gels.length} × 25 g ≈ {gels.gPerHour} g pro Stunde, jedes Gel mit Wasser an der nächsten Verpflegungsstelle.
            </p>
          </Card>
        </div>

        {RACE.gpxPath && <div className="min-w-0 lg:col-span-12">
          <CourseMap race={RACE} course={course ?? null} status={courseLoading ? 'loading' : course ? 'ready' : 'missing'} />
        </div>}
      </div>
    </div>
  )
}

const kmDe = (km: number) => km.toLocaleString('de-DE', { maximumFractionDigits: 1 })

function Row({ big, text }: { big: string; text: string }) {
  return (
    <div className="flex items-baseline gap-3 border-t border-border py-2 first:border-t-0">
      <span className="w-16 shrink-0 text-xl font-semibold tabular-nums">{big}</span>
      <span className="text-sm">{text}</span>
    </div>
  )
}
