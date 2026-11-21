'use client'

import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import { type PlanSession } from '@/lib/plan/types'
import { estimateDurationS, fmtDuration, fmtKm } from '@/lib/plan/format'
import { weekOf } from '@/lib/plan/blocks'
import { changeWhy, type Overrides } from '@/lib/plan/effective'
import type { DayActual } from '@/app/api/running/plan-actuals/route'
import { Card } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { Figure } from '@/components/ui/figure'
import { TypeTag } from './tags'
import { WeekEditor } from './WeekEditor'
import { SessionDetails } from './SessionDetails'

function relativeDay(date: string, today: string) {
  const d = differenceInCalendarDays(parseISO(date), parseISO(today))
  if (d === 0) return 'Heute'
  if (d === 1) return 'Morgen'
  return format(parseISO(date), 'EEEE', { locale: de })
}

export function TrainingSchedule({ today, actuals, cross, kbDone, syncedThrough, sessions, overrides, baseSessions, autoSessions, engineOverrides, engineNotes, onChange, saving, saveError, saveMessage, onRetry, className }: {
  today: string
  actuals: Map<string, DayActual>
  cross?: Map<string, { letter: string; label: string; kb?: boolean }[]>   // cross-training sessions per day (08-04)
  kbDone?: Set<string>               // days with a Strength or Gym session
  syncedThrough?: string | null      // last day the latest sync covers
  sessions: PlanSession[]
  overrides: Overrides
  baseSessions: PlanSession[]        // plan without engine 'Ausgleich' km — what edits work on
  autoSessions: PlanSession[]        // plan as shown without manual edits (engine changes, return caps)
  engineOverrides: Overrides
  engineNotes: Map<string, string>   // date → reason of the engine change on that day
  onChange: (next: Overrides) => void
  saving: boolean
  saveError: boolean
  saveMessage?: string
  onRetry: () => void
  className?: string
}) {
  const doneToday = actuals.has(today)
  const upcoming = sessions.filter(
    (s) => s.type !== 'rest' && (s.date > today || (s.date === today && !doneToday)),
  )
  const next = upcoming[0]
  const after = upcoming.slice(1, 4)

  const week = weekOf(today)

  return (
    <Card
      title="Trainingsplan"
      aside={week && <Chip className="tabular-nums">KW {week.kw} · {fmtKm(week.km)} km</Chip>}
      className={className}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {next ? <NextSession session={next} today={today} why={changeWhy(overrides[next.date], engineNotes.get(next.date))} /> : (
          <div className="rounded-card p-4 text-body-sm text-muted-foreground shadow-hairline">Keine Einheiten mehr geplant.</div>
        )}
        <ul className="flex flex-col gap-2">
          {after.map((s) => (
            <li key={s.date} className="rounded-card px-3 py-2.5 shadow-hairline">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-body-sm font-medium">{s.title}</span>
                <span className="flex items-center gap-1 text-caption text-muted-foreground shrink-0">
                  <CalendarDays className="h-3.5 w-3.5" />{relativeDay(s.date, today)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <TypeTag type={s.type} />
                {s.km && <Chip className="tabular-nums">{fmtKm(s.km)} km</Chip>}
                {s.pace && <Chip className="tabular-nums">@ {s.pace}/km</Chip>}
              </div>
              <SessionDetails session={s} compact />
            </li>
          ))}
        </ul>
      </div>

      <WeekEditor today={today} sessions={sessions} baseSessions={baseSessions} autoSessions={autoSessions} overrides={overrides} engineOverrides={engineOverrides} engineNotes={engineNotes} actuals={actuals} cross={cross} kbDone={kbDone} syncedThrough={syncedThrough} onChange={onChange} saving={saving} saveError={saveError} saveMessage={saveMessage} onRetry={onRetry} />
    </Card>
  )
}

function NextSession({ session, today, why }: { session: PlanSession; today: string; why: string[] }) {
  return (
    <div className="rounded-card bg-card p-4 shadow-raised">
      <div className="text-caption text-muted-foreground">Nächste Einheit</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 text-title-sm">{session.title}</h3>
        {session.key && <Chip tone="solid">Kerneinheit</Chip>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip>{relativeDay(session.date, today)}, {format(parseISO(session.date), 'd. MMM', { locale: de })}</Chip>
        <TypeTag type={session.type} />
      </div>
      <SessionDetails session={session} why={why} />
      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Figure label="Distanz" value={session.km ? fmtKm(session.km) : '–'} unit="km" />
        <Figure label="Zieltempo" value={session.pace ?? 'locker'} unit={session.pace ? '/km' : undefined} />
        <Figure label="Dauer ca." value={session.km ? fmtDuration(estimateDurationS(session)) : '–'} />
      </div>
    </div>
  )
}
