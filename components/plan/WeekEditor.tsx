'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { addDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Check, ChevronLeft, ChevronRight, AlertTriangle, RotateCcw, Scale, ArrowRight, SlidersHorizontal, Dumbbell } from 'lucide-react'
import { type PlanSession } from '@/lib/plan/types'
import { fmtKm } from '@/lib/plan/format'
import {
  applyMove, balanceWeek, planWeeks, dayLabel, dayState, kmEditEffect, moveModes, parseKm, resetWeek, runMark, setDayKm, setPace, setZone2, strengthEditable, toggleStrength, weekBreakdown, weekDates, weekSummary, z2State,
  type ActualKm, type DayState, type MoveMode, type Overrides,
} from '@/lib/plan/effective'
import type { DayActual } from '@/app/api/running/plan-actuals/route'
import { cn } from '@/lib/utils'
import { TypeTag } from './ui'
import { useIsPhone } from '@/lib/use-media'
import { SessionDetails } from './SessionDetails'
import { SessionEditor } from './SessionEditor'
import { PauseControl } from './PauseControl'
import { strengthDetail, strengthMark, strengthWeek, type KbMark } from '@/lib/plan/strength'

type CrossPill = { letter: string; label: string; kb?: boolean }   // kb: a Strength or Gym session (counts for a kettlebell marker)

export function WeekEditor({ today, sessions, baseSessions, overrides, engineOverrides, engineNotes, actuals, cross, kbDone, syncedThrough = null, onChange, saving, saveError, onRetry }: {
  today: string
  sessions: PlanSession[]
  baseSessions: PlanSession[]
  overrides: Overrides
  engineOverrides: Overrides
  engineNotes: Map<string, string>
  actuals: Map<string, DayActual>
  cross?: Map<string, CrossPill[]>     // cross-training sessions per day (08-04): small letter pills, no km
  kbDone?: Set<string>                 // days with a Strength or Gym session (kettlebell done check)
  syncedThrough?: string | null        // last day a sync covers: before it an undone marker is "ausgelassen"
  onChange: (next: Overrides) => void
  saving: boolean
  saveError: boolean
  onRetry: () => void
}) {
  const actualKm: ActualKm = new Map([...actuals].map(([d, a]) => [d, a.km]))
  const weeks = planWeeks()
  const currentIdx = Math.max(0, weeks.findIndex((w) => w.start <= today && today <= w.end))
  const [weekIdx, setWeekIdx] = useState(currentIdx)
  // A new week begins (page left open): follow it, unless the runner browsed to another week.
  const [followIdx, setFollowIdx] = useState(currentIdx)
  if (followIdx !== currentIdx) {
    setFollowIdx(currentIdx)
    if (weekIdx === followIdx) setWeekIdx(currentIdx)
  }
  const [selected, setSelected] = useState<string | null>(null)
  const [balanceNote, setBalanceNote] = useState<string | null>(null)

  const week = weeks[weekIdx]
  const summary = weekSummary(week, today, sessions, actualKm)
  const edited = summary.days.some((d) => overrides[d.date])
  const weekOver = week.end < today
  const done = kbDone ?? new Set<string>()
  const kbOf = (d: DayState) => strengthMark(d.session, today, done.has(d.date), syncedThrough)
  const kbCount = strengthWeek(weekDates(week), sessions, done)

  function change(next: Overrides) {
    setBalanceNote(null)
    onChange(next)
  }

  function balance() {
    const r = balanceWeek(weekSummary(week, today, baseSessions, actualKm), today, overrides)
    onChange(r.overrides)
    const placed = r.added.map((a) => `+${fmtKm(a.km)} km ${dayLabel(a.date)}`).join(', ')
    setBalanceNote(
      (placed ? `Verteilt: ${placed}` : 'Keine lockeren Tage mehr zum Auffüllen.') +
      (r.unplacedKm > 0 ? ` — ${fmtKm(r.unplacedKm)} km passen nicht: lockere Tage sind am Limit (+30 % bzw. +5 km), Sonntag und Regeneration bleiben frei.` : ''),
    )
  }

  const phone = useIsPhone()
  const panel = selected ? (
        <DayPanel
          key={selected}
          day={summary.days.find((d) => d.date === selected)!}
          engineNote={overrides[selected] ? undefined : engineNotes.get(selected)}
          today={today} sessions={baseSessions} actualKm={actualKm} actual={actuals.get(selected)}
          saving={saving}
          onMove={(to, mode) => {
            change(applyMove(overrides, selected, to, mode, today, baseSessions, actualKm))
            setSelected(to)
          }}
          edited={!!overrides[selected]}
          onSetKm={(km, opts) => change(setDayKm(overrides, selected, km, baseSessions, opts))}
          onZ2={(z2) => change(z2 ? setZone2(overrides, selected, baseSessions) : setPace(overrides, selected, baseSessions))}
          effective={sessions}
          onEdit={(s) => {
            // A new session type keeps the day's kettlebell marker, a rest day drops it.
            const kb = baseSessions.find((x) => x.date === selected)?.strength
            change({ ...overrides, [selected]: s.strength || !kb || s.type === 'rest' ? s : { ...s, strength: kb } })
          }}
          kb={kbOf(summary.days.find((d) => d.date === selected)!)}
          onKb={() => change(toggleStrength(overrides, selected, baseSessions))}
          onRestore={() => { const next = { ...overrides }; delete next[selected]; change(next) }}
        />
  ) : null

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconButton label="Vorherige Woche" disabled={weekIdx === 0} onClick={() => { setWeekIdx(weekIdx - 1); setSelected(null); setBalanceNote(null) }}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <span className="text-sm font-medium tabular-nums">
            KW {week.kw} <span className="text-muted-foreground font-normal">· {format(parseISO(week.start), 'd.M.')}–{format(parseISO(week.end), 'd.M.')}</span>
          </span>
          <IconButton label="Nächste Woche" disabled={weekIdx === weeks.length - 1} onClick={() => { setWeekIdx(weekIdx + 1); setSelected(null); setBalanceNote(null) }}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <span>Ziel {week.km} km</span>
          <span>·</span>
          <span>{weekOver ? 'Gelaufen' : 'Prognose'} <span className="font-semibold text-foreground">{fmtKm(summary.forecastKm)} km</span></span>
          {Math.abs(summary.gapKm) >= 0.5 && (
            <span className={cn('rounded-full px-2 py-0.5 font-medium', summary.gapKm > 0 ? 'bg-brand-soft text-brand' : 'bg-teal-soft text-teal')}>
              {summary.gapKm > 0 ? `−${fmtKm(summary.gapKm)}` : `+${fmtKm(-summary.gapKm)}`} km
            </span>
          )}
          {kbCount && <><span>·</span><span title="Kettlebell erledigt / geplant (optionale zählen erst, wenn erledigt)">Kettlebell <span className="font-semibold text-foreground">{kbCount.done}/{kbCount.planned}</span></span></>}
        </div>
      </div>

      {Math.abs(summary.gapKm) >= 1 && <WeekKmWhy b={weekBreakdown(week, today, overrides, engineOverrides, engineNotes, actualKm)} over={weekOver} />}

      {phone ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {summary.days.map((d) => (
            <li key={d.date}>
              <DayRow day={d} today={today} edited={!!overrides[d.date]} auto={!overrides[d.date] && engineNotes.has(d.date)} cross={cross?.get(d.date)} kb={kbOf(d)}
                selected={selected === d.date} onSelect={() => setSelected(selected === d.date ? null : d.date)} />
              {selected === d.date && panel}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {summary.days.map((d) => (
            <DayCell key={d.date} day={d} today={today} edited={!!overrides[d.date]} auto={!overrides[d.date] && engineNotes.has(d.date)} cross={cross?.get(d.date)} kb={kbOf(d)}
              selected={selected === d.date} onSelect={() => setSelected(selected === d.date ? null : d.date)} />
          ))}
        </div>
      )}

      {!weekOver && summary.gapKm >= 0.5 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-soft/50 px-3.5 py-2.5 text-sm">
          <span>Zum Wochenziel fehlen <span className="font-semibold tabular-nums">{fmtKm(summary.gapKm)} km</span>.</span>
          <button onClick={balance} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50">
            <Scale className="h-3.5 w-3.5" /> Ausgleichen
          </button>
        </div>
      )}
      {balanceNote && <p className="mt-2 text-xs text-muted-foreground">{balanceNote}</p>}

      {summary.warnings.map((w) => (
        <p key={w} className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />{w}
        </p>
      ))}

      {!phone && panel}

      {saveError && !saving && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand">
          <span>Änderung konnte nicht gespeichert werden und wurde zurückgenommen.</span>
          <button onClick={onRetry} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90">Erneut versuchen</button>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{saving ? 'Speichern…' : 'Tag antippen, um km zu ändern oder Einheiten zu verschieben.'}</span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          <PauseControl today={today} compact />
          <Link href="/plan/anpassen" className="tap inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-medium text-foreground hover:bg-secondary">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Plan anpassen
          </Link>
        </span>
        {edited && (
          <button onClick={() => change(resetWeek(week, overrides))} disabled={saving}
            className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50">
            <RotateCcw className="h-3.5 w-3.5" /> Woche zurücksetzen
          </button>
        )}
      </div>
    </div>
  )
}

// Cross-training on that day: one letter per session (K Kraft · S Schwimmen · R Rad · G Gym), the label as tooltip.
// A kettlebell marker joins them: a grey dashed K when planned (lighter when optional), amber when the day is past
// and synced without a session ("ausgelassen"), and when done the day's K/G pill turns teal.
const KB_LABEL: Record<KbMark, string> = { planned: 'Kettlebell geplant', optional: 'Kettlebell optional', done: 'Kettlebell erledigt', skipped: 'Kettlebell ausgelassen' }
function CrossPills({ pills = [], kb, wide, className }: { pills?: CrossPill[]; kb?: KbMark | null; wide?: boolean; className?: string }) {
  if (!pills.length && !kb) return null
  const doneAt = kb === 'done' ? Math.max(0, pills.findIndex((p) => p.kb)) : -1
  const pill = 'inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold leading-none'
  return (
    <span className={cn('inline-flex gap-0.5', className)}>
      {kb && kb !== 'done' && (
        <span title={KB_LABEL[kb]} aria-label={KB_LABEL[kb]}
          className={cn(pill, kb === 'skipped' ? 'bg-amber-100 text-amber-800' : 'border border-dashed border-muted-foreground/50 text-muted-foreground', kb === 'optional' && 'opacity-60')}>
          K{wide && kb === 'skipped' ? ' ausgelassen' : ''}
        </span>
      )}
      {pills.map((p, i) => (
        <span key={i} title={i === doneAt ? `${KB_LABEL.done} · ${p.label}` : p.label} aria-label={i === doneAt ? `${KB_LABEL.done} · ${p.label}` : p.label}
          className={cn(pill, i === doneAt ? 'bg-teal-soft text-teal' : 'bg-secondary text-foreground')}>
          {p.letter}
        </span>
      ))}
    </span>
  )
}

function DayCell({ day, today, edited, auto, cross, kb, selected, onSelect }: {
  day: DayState; today: string; edited: boolean; auto: boolean; cross?: CrossPill[]; kb: KbMark | null; selected: boolean; onSelect: () => void
}) {
  const { status } = day
  const mark = runMark(day)
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'relative rounded-lg border px-1 py-2 flex flex-col items-center gap-1 text-center transition-colors hover:border-foreground/40',
        day.date === today ? 'border-foreground/60' : 'border-border',
        mark.ran && 'bg-teal-soft/60 border-teal/30',
        status === 'planned' && 'border-dashed',
        status === 'paused' && 'bg-amber-50 border-amber-200',
        selected && 'ring-2 ring-foreground ring-offset-1',
      )}
    >
      {edited && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" aria-label="geändert" />}
      {auto && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-label="automatisch angepasst" />}
      <CrossPills pills={cross} kb={kb} className="absolute left-1 top-1" />
      <span className="text-[11px] text-muted-foreground uppercase">{format(parseISO(day.date), 'EEEEEE', { locale: de })}</span>
      <span className="h-4 grid place-items-center">
        {mark.ran ? <RunTick diffKm={mark.diffKm} />
          : status === 'missed' ? <span className="text-[10px] font-medium text-brand">offen</span>
          : status === 'paused' ? <span className="text-[10px] font-medium text-amber-700">{day.session?.paused === 'krank' ? 'krank' : 'Pause'}</span>
          : <span className={cn('h-1.5 w-1.5 rounded-full', day.plannedKm ? 'bg-muted-foreground/40' : 'bg-transparent')} />}
      </span>
      <span className="text-xs tabular-nums font-medium">{day.actualKm || day.plannedKm ? fmtKm(day.actualKm || day.plannedKm) : '–'}</span>
      <span className="text-[10px] tabular-nums text-muted-foreground">{day.actualKm && day.plannedKm ? `/${fmtKm(day.plannedKm)}` : ' '}</span>
    </button>
  )
}

function DayPanel({ day, engineNote, edited, today, sessions, actualKm, actual, saving, onMove, onSetKm, onZ2, effective, onEdit, onRestore, kb, onKb }: {
  day: DayState
  engineNote?: string
  today: string
  sessions: PlanSession[]
  actualKm: ActualKm
  actual?: DayActual
  saving: boolean
  onMove: (to: string, mode: MoveMode) => void
  edited: boolean
  onSetKm: (km: number, opts?: { shortenBlock?: boolean }) => void
  onZ2: (z2: boolean) => void
  effective: PlanSession[]
  onEdit: (s: PlanSession) => void
  onRestore: () => void
  kb: KbMark | null
  onKb: () => void
}) {
  const [pending, setPending] = useState<string | null>(null)
  const s = day.session
  const z2 = z2State(s, day.date)

  // Targets: today until the end of next week; moveModes keeps race day and its sides apart.
  const targets = Array.from({ length: 14 }, (_, i) => format(addDays(parseISO(today), i), 'yyyy-MM-dd'))
    .map((d) => ({ date: d, modes: moveModes(day.date, d, today, sessions, actualKm), state: dayState(d, today, sessions, actualKm) }))
    .filter((t) => t.modes.length)

  const movable = targets.length > 0
  const pendingTarget = targets.find((t) => t.date === pending)

  return (
    <div className="mt-3 rounded-xl border border-border p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{dayLabel(day.date)}</span>
        <span className="text-sm">{s?.title ?? 'Frei'}</span>
        {s && <TypeTag type={s.type} />}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
        <span>Plan {fmtKm(day.plannedKm)} km</span>
        <span>Gelaufen {fmtKm(day.actualKm)} km</span>
        {day.openKm > 0 && <span className="font-medium text-brand">Offen {fmtKm(day.openKm)} km</span>}
        {actual?.runs[0] && (
          <Link href={`/running/activities/${actual.runs[0].id}`} className="underline underline-offset-2 hover:text-foreground">Lauf ansehen</Link>
        )}
      </div>
      {s && <SessionDetails session={s} why={[...(engineNote ? [`Automatisch: ${engineNote}`] : []), ...(edited ? ['Von dir angepasst.'] : [])]} />}
      {z2 && day.actualKm === 0 && day.date >= today && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">Laufen als</span>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Zone 2 oder Tempo">
            {([['z2', 'Locker (Z2)'], ['pace', 'Tempolauf']] as const).map(([k, label]) => (
              <button key={k} type="button" disabled={saving} aria-pressed={z2 === k} onClick={() => z2 !== k && onZ2(k === 'z2')}
                className={cn('tap rounded-md px-2.5 py-1 font-medium disabled:opacity-50', z2 === k ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
          {z2 === 'z2' && s?.was && <span className="text-muted-foreground">Geplant war: {s.was.title}{s.was.km ? ` (${fmtKm(s.was.km)} km)` : ''}</span>}
        </div>
      )}
      {strengthEditable(s, day.date) && s && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-medium"><Dumbbell className="h-3.5 w-3.5" aria-hidden /> Kettlebell</span>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Kettlebell an diesem Tag">
            {([[true, 'An'], [false, 'Aus']] as const).map(([on, label]) => (
              <button key={label} type="button" disabled={saving} aria-pressed={!!s.strength === on} onClick={() => !!s.strength !== on && onKb()}
                className={cn('tap rounded-md px-2.5 py-1 font-medium disabled:opacity-50', !!s.strength === on ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
          {kb === 'done' && <span className="font-medium text-teal">erledigt</span>}
          {kb === 'skipped' && <span className="font-medium text-amber-700">ausgelassen</span>}
          {kb === 'optional' && <span className="text-muted-foreground">optional</span>}
          {s.strength && s.type === 'rest' && <span className="text-muted-foreground">{strengthDetail(s)}</span>}
        </div>
      )}
      {day.status === 'paused' && <p className="mt-2 text-xs text-muted-foreground">Dieser Tag liegt in deiner {s?.paused === 'krank' ? 'Krankheit' : 'Pause'}.</p>}
      {s?.type !== 'race' && day.status !== 'paused' && <KmEditor plannedKm={day.plannedKm} session={s} saving={saving} onSave={onSetKm} />}
      {day.date >= today && day.actualKm === 0 && day.status !== 'paused' && s?.type !== 'race' && !s?.anchor && (
        <div className="flex flex-wrap items-end gap-2">
          <SessionEditor key={day.date} date={day.date} current={s} sessions={effective} saving={saving} onSave={onEdit} />
          {edited && (
            <button type="button" onClick={onRestore} disabled={saving}
              className="tap mt-3 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
              <RotateCcw className="h-3.5 w-3.5" /> Original wiederherstellen
            </button>
          )}
        </div>
      )}

      {movable ? (
        <>
          <div className="mt-3 text-xs font-medium">
            {day.status === 'partial' ? `Einheit tauschen oder offene ${fmtKm(day.openKm)} km verschieben nach:` : day.status === 'missed' ? 'Einheit nachholen am:' : 'Einheit verschieben nach:'}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {targets.map((t) => (
              <button key={t.date} disabled={saving}
                onClick={() => (t.modes.length === 1 ? onMove(t.date, t.modes[0]) : setPending(pending === t.date ? null : t.date))}
                className={cn('rounded-lg border px-2.5 py-1.5 text-xs tabular-nums hover:border-foreground/50 disabled:opacity-50',
                  pending === t.date ? 'border-foreground bg-secondary' : 'border-border')}>
                <span className="font-medium">{format(parseISO(t.date), 'EEEEEE d.M.', { locale: de })}</span>
                <span className="ml-1.5 text-muted-foreground">{t.state.plannedKm ? `${fmtKm(t.state.plannedKm)} km` : 'frei'}</span>
              </button>
            ))}
          </div>
          {pendingTarget && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">{dayLabel(pendingTarget.date)} hat schon {fmtKm(pendingTarget.state.plannedKm)} km:</span>
              <button onClick={() => onMove(pendingTarget.date, 'swap')} disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 font-medium text-background disabled:opacity-50">
                Tauschen
              </button>
              <button onClick={() => onMove(pendingTarget.date, 'merge')} disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 font-medium disabled:opacity-50">
                Zusammenlegen <ArrowRight className="h-3 w-3" /> {fmtKm(pendingTarget.state.plannedKm + (day.status === 'planned' ? day.plannedKm : day.openKm))} km
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {s?.type === 'race' ? 'Das Rennen bleibt, wo es ist.'
            : day.status === 'done' ? 'Erledigt.'
            : day.status === 'rest' || day.status === 'extra' ? 'Nichts zu verschieben.'
            : 'Keine passenden Tage mehr vor dem Rennen.'}
        </p>
      )}
    </div>
  )
}

// Planned km for one day: type a value or step by 1 km, then apply.
function KmEditor({ plannedKm, session, saving, onSave }: {
  plannedKm: number; session?: PlanSession; saving: boolean; onSave: (km: number, opts?: { shortenBlock?: boolean }) => void
}) {
  const [value, setValue] = useState(fmtKm(plannedKm))
  // Follow outside changes (save, Ausgleichen, reset) while the panel is open.
  useEffect(() => setValue(fmtKm(plannedKm)), [plannedKm])
  const km = parseKm(value)
  const changed = km != null && km !== plannedKm
  // Structured session: warm-up/cool-down adapt; a block that does not fit is shortened (shown before saving).
  const effect = changed ? kmEditEffect(session, km) : null
  const step = (d: number) => setValue(fmtKm(Math.min(60, Math.max(0, (km ?? plannedKm) + d))))
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (changed && !saving) onSave(km)
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor="planned-km" className="font-medium">Geplante km</label>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => step(-1)} aria-label="1 km weniger" disabled={saving}
          className="grid h-7 w-7 place-items-center rounded-md border border-border hover:border-foreground/50 disabled:opacity-50">−</button>
        <input id="planned-km" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} disabled={saving}
          aria-invalid={km == null}
          className={cn('h-7 w-16 rounded-md border bg-card px-2 text-center tabular-nums outline-none focus:border-foreground/60',
            km == null ? 'border-brand' : 'border-border')} />
        <button type="button" onClick={() => step(1)} aria-label="1 km mehr" disabled={saving}
          className="grid h-7 w-7 place-items-center rounded-md border border-border hover:border-foreground/50 disabled:opacity-50">+</button>
      </div>
      <button type="submit" disabled={!changed || saving}
        className="rounded-lg bg-foreground px-2.5 py-1.5 font-medium text-background hover:bg-foreground/85 disabled:opacity-40">
        Übernehmen
      </button>
      {km == null && <span className="text-brand">0–60 km, z. B. 14,5</span>}
      {effect?.kind === 'ok' && <span className="basis-full text-muted-foreground">Neu: {effect.notes}</span>}
      {effect?.kind === 'block' && (
        <span className="basis-full text-amber-700">Der Block passt nicht in {fmtKm(km!)} km und wird gekürzt: {effect.notes}</span>
      )}
    </form>
  )
}

// Why the week's km differ from its target, part by part (only parts of at least 0,5 km).
function WeekKmWhy({ b, over }: { b: ReturnType<typeof weekBreakdown>; over: boolean }) {
  const sign = (n: number) => `${n > 0 ? '+' : '−'}${fmtKm(Math.abs(n))} km`
  const parts: { label: string; km: number; note?: string }[] = [
    { label: 'Plan', km: b.planKm, note: 'Summe der Plantage weicht vom Wochenziel ab' },
    { label: 'Automatisch', km: b.engineKm, note: b.engineReasons.join(' · ') || undefined },
    { label: 'Deine Änderungen', km: b.manualKm },
    { label: over ? 'Gelaufen vs. Plan' : 'Bisher gelaufen vs. Plan', km: b.runKm, note: b.runKm < 0 ? 'nicht oder kürzer gelaufen' : 'mehr gelaufen' },
  ].filter((p) => Math.abs(p.km) >= 0.5)
  if (!parts.length) return null
  return (
    <div className="mt-2 rounded-xl bg-secondary/60 px-3.5 py-2.5 text-xs">
      <div className="font-medium">Warum {fmtKm(b.forecastKm)} statt {b.targetKm} km?</div>
      <ul className="mt-1 grid gap-0.5 tabular-nums text-muted-foreground">
        {parts.map((p) => (
          <li key={p.label}><span className="text-foreground">{p.label} {sign(p.km)}</span>{p.note && <> · {p.note}</>}</li>
        ))}
      </ul>
    </div>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="tap grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
      {children}
    </button>
  )
}

// Run days: tick, plus the difference to the plan when it is at least 0,5 km (07-24).
function RunTick({ diffKm, className }: { diffKm: number | null; className?: string }) {
  const label = diffKm == null ? 'gelaufen'
    : `gelaufen, ${fmtKm(Math.abs(diffKm))} km ${diffKm < 0 ? 'weniger' : 'mehr'} als geplant`
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={label}>
      <Check className="h-3.5 w-3.5 text-teal" aria-hidden />
      {diffKm != null && (
        <span className={cn('text-[10px] font-medium tabular-nums', diffKm < 0 ? 'text-brand' : 'text-muted-foreground')}>
          {diffKm < 0 ? '−' : '+'}{fmtKm(Math.abs(diffKm))}
        </span>
      )}
    </span>
  )
}

// Phones: one readable row per day (weekday, type, title, km, status); tap opens the day panel below it.
function DayRow({ day, today, edited, auto, cross, kb, selected, onSelect }: {
  day: DayState; today: string; edited: boolean; auto: boolean; cross?: CrossPill[]; kb: KbMark | null; selected: boolean; onSelect: () => void
}) {
  const { status, session } = day
  const mark = runMark(day)
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        day.date === today ? 'border-foreground/60' : 'border-border',
        mark.ran && 'bg-teal-soft/60 border-teal/30',
        status === 'planned' && 'border-dashed',
        status === 'paused' && 'bg-amber-50 border-amber-200',
        selected && 'ring-2 ring-foreground ring-offset-1',
      )}
    >
      <span className="w-11 shrink-0 text-xs leading-tight text-muted-foreground">
        <span className="block font-medium uppercase text-foreground">{format(parseISO(day.date), 'EEEEEE', { locale: de })}</span>
        {format(parseISO(day.date), 'd.M.')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {session && <TypeTag type={session.type} />}
          {edited && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="geändert" />}
          {auto && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-label="automatisch angepasst" />}
          <CrossPills pills={cross} kb={kb} wide />
        </span>
        <span className="mt-0.5 block truncate text-sm">{session?.title ?? 'Ruhetag'}</span>
      </span>
      <span className="shrink-0 text-right tabular-nums">
        <span className="block text-sm font-medium">{day.actualKm || day.plannedKm ? `${fmtKm(day.actualKm || day.plannedKm)} km` : '–'}</span>
        <span className="block text-[11px] text-muted-foreground">
          {mark.ran ? <RunTick diffKm={mark.diffKm} className="justify-end" />
            : status === 'missed' ? <span className="text-brand">offen</span>
            : status === 'paused' ? <span className="text-amber-700">{session?.paused === 'krank' ? 'krank' : 'Pause'}</span>
            : ' '}
        </span>
      </span>
    </button>
  )
}
