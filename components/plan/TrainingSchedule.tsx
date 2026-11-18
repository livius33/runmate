'use client'

import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import { type PlanSession } from '@/lib/plan/types'
import { estimateDurationS, fmtDuration, fmtKm } from '@/lib/plan/format'
import { weekOf } from '@/lib/plan/blocks'
import type { Overrides } from '@/lib/plan/effective'
import type { DayActual } from '@/app/api/running/plan-actuals/route'
import { Card, Stat, TypeTag, Pill } from './ui'
import { WeekEditor } from './WeekEditor'
import { SessionDetails } from './SessionDetails'

function relativeDay(date: string, today: string) {
  const d = differenceInCalendarDays(parseISO(date), parseISO(today))
  if (d === 0) return 'Heute'
  if (d === 1) return 'Morgen'
  return format(parseISO(date), 'EEEE', { locale: de })
}

export function TrainingSchedule({ today, actuals, cross, kbDone, syncedThrough, sessions, overrides, baseSessions, autoSessions, engineOverrides, engineNotes, onChange, saving, saveError, saveMessage, onRetry }: {
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
      aside={week && <Pill className="tabular-nums">KW {week.kw} · {week.km} km</Pill>}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {next ? <NextSession session={next} today={today} why={engineNotes.get(next.date) ? [`Automatisch: ${engineNotes.get(next.date)}`] : overrides[next.date] ? ['Von dir angepasst.'] : []} /> : (
          <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Keine Einheiten mehr geplant.</div>
        )}
        <ul className="flex flex-col gap-2">
          {after.map((s) => (
            <li key={s.date} className="rounded-xl border border-border px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate">{s.title}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <CalendarDays className="h-3.5 w-3.5" />{relativeDay(s.date, today)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <TypeTag type={s.type} />
                {s.km && <Pill>{fmtKm(s.km)} km</Pill>}
                {s.pace && <Pill>@ {s.pace}/km</Pill>}
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
    <div className="rounded-xl border border-border p-4 shadow-[0_4px_16px_rgba(16,24,40,0.06)]">
      <div className="text-xs text-muted-foreground">Nächste Einheit</div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{session.title}</h3>
        {session.key && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">Kerneinheit</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill>{relativeDay(session.date, today)}, {format(parseISO(session.date), 'd. MMM', { locale: de })}</Pill>
        <TypeTag type={session.type} />
      </div>
      <SessionDetails session={session} why={why} />
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Stat label="Distanz" value={session.km ? fmtKm(session.km) : '–'} unit="km" />
        <Stat label="Zieltempo" value={session.pace ?? 'locker'} unit={session.pace ? '/km' : undefined} />
        <Stat label="Dauer ca." value={session.km ? fmtDuration(estimateDurationS(session)) : '–'} />
      </div>
    </div>
  )
}
