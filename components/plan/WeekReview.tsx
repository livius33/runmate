'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Check, ChevronLeft, ChevronRight, X, ArrowRight, Clock, MessageSquare } from 'lucide-react'
import { type PlanSession, type PlanWeek } from '@/lib/plan/types'
import { fmtKm } from '@/lib/plan/format'
import { planWeeks } from '@/lib/plan/effective'
import type { EngineChange } from '@/lib/plan/engine'
import type { DatedRun } from '@/lib/plan/pace-check'
import { weekReview, type KeyResult } from '@/lib/insights/week'
import { feedbackDue, weekOverview, type LoadPoint } from '@/lib/insights/week-overlay'
import { FATIGUE_LABEL, RATING_LABEL, type Score, type WeekFeedback, type WeekFeedbackEntry } from '@/lib/feedback/week'
import type { RunFeel } from '@/app/api/feedback/week/route'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Chip } from '@/components/ui/chip'
import { Figure } from '@/components/ui/figure'
import { WeekFeedbackOverlay, type RunFeelSummary } from './WeekFeedbackOverlay'

const tsbText = (n: number | null) => (n == null ? '–' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}`)

const KEY_ICON: Record<KeyResult['status'], { icon: typeof Check; tone: string }> = {
  done: { icon: Check, tone: 'text-teal' },
  missed: { icon: X, tone: 'text-brand' },
  moved: { icon: ArrowRight, tone: 'text-warning' },
  open: { icon: Clock, tone: 'text-muted-foreground' },
}

// "Später" is remembered per browser only (the shared store holds ratings, nothing else — contract with 07-25).
const LATER_KEY = 'week-feedback-later'
const readLater = () => { try { return localStorage.getItem(LATER_KEY) } catch { return null } }
const writeLater = (week: string) => { try { localStorage.setItem(LATER_KEY, week) } catch {} }

type FeedbackData = WeekFeedback & { runs: Record<string, RunFeel> }
const EMPTY: FeedbackData = { v: 1, byWeek: {}, runs: {} }

// One plan week in review: volume, 80/20, key sessions, form, and next week's focus. At the start of a new week the
// finished week opens once as the feedback overlay (07-26); "Woche bewerten" reopens it for any finished week.
export function WeekReview({ today, sessions, runs, fitness, engineLog, className }: {
  today: string
  sessions: PlanSession[]
  runs: DatedRun[]
  fitness: LoadPoint[]
  engineLog: EngineChange[]
  className?: string
}) {
  const started = planWeeks().filter((w) => w.start <= today)
  const latest = Math.max(0, started.length - 1)
  const [idx, setIdx] = useState(latest)
  // A new week has started (page left open): follow it, unless the runner browsed to an earlier week.
  const [followIdx, setFollowIdx] = useState(latest)
  if (followIdx !== latest) {
    setFollowIdx(latest)
    if (idx === followIdx) setIdx(latest)
  }

  const qc = useQueryClient()
  const { data: feedback = EMPTY, isSuccess: feedbackLoaded } = useQuery<FeedbackData>({
    queryKey: ['week-feedback'],
    queryFn: () => fetch('/api/feedback/week').then((r) => (r.ok ? r.json() : EMPTY)),
  })
  const [open, setOpen] = useState<PlanWeek | null>(null)
  // Once per day (the page may stay open over Monday midnight): offer the finished week, unless rated or put off.
  const offered = useRef<string | null>(null)
  useEffect(() => {
    if (!feedbackLoaded || offered.current === today) return
    offered.current = today
    const due = feedbackDue({ today, byWeek: feedback.byWeek, dismissed: readLater() })
    if (due) setOpen(due)
  }, [feedbackLoaded, feedback.byWeek, today])

  const save = useMutation({
    mutationFn: async (input: { week: string; rating: Score; fatigue: Score; note: string }) => {
      const r = await fetch('/api/feedback/week', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error ?? 'Speichern fehlgeschlagen.')
      return data as WeekFeedback
    },
    onSuccess: (next) => {
      qc.setQueryData<FeedbackData>(['week-feedback'], (old) => ({ ...(old ?? EMPTY), byWeek: next.byWeek }))
      setOpen(null)
    },
  })
  const later = () => { if (open) writeLater(open.start); setOpen(null); save.reset() }

  const overview = useMemo(
    () => (open ? weekOverview({ week: open, today, sessions, runs, fitness, engineLog }) : null),
    [open, today, sessions, runs, fitness, engineLog])
  const feel = useMemo<RunFeelSummary | null>(() => {
    if (!open) return null
    const feels = runs.filter((x) => x.date >= open.start && x.date <= open.end).map((x) => feedback.runs[x.id]).filter((f): f is RunFeel => !!f)
    if (!feels.length) return null
    return { n: feels.length, avgFeel: feels.reduce((t, f) => t + f.feel, 0) / feels.length, pain: feels.filter((f) => f.pain !== 'none').length }
  }, [open, runs, feedback.runs])

  if (!started.length) return null
  const week = started[idx]
  const r = weekReview({ week, today, sessions, runs, fitness, engineLog })
  const finished = week.end < today
  const stored: WeekFeedbackEntry | undefined = feedback.byWeek[week.start]

  return (
    <Card title="Wochenrückblick" className={cn('h-full', className)} aside={
      <div className="flex items-center gap-1">
        <NavButton label="Vorherige Woche" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-4 w-4" /></NavButton>
        <span className="text-caption tabular-nums text-muted-foreground">
          <span className="font-mono">KW {r.week.kw}</span> · {format(parseISO(r.week.start), 'd.M.')}–{format(parseISO(r.week.end), 'd.M.')}
        </span>
        <NavButton label="Nächste Woche" disabled={idx === started.length - 1} onClick={() => setIdx(idx + 1)}><ChevronRight className="h-4 w-4" /></NavButton>
      </div>
    }>
      {r.running && <Chip tone="teal" className="mb-3">läuft noch</Chip>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Umfang" value={`${fmtKm(r.km)}/${fmtKm(r.targetKm)}`} unit={`km · ${r.pct} %`} />
        <Figure label="Läufe" value={r.runs} />
        <Figure label="Locker (Z1+Z2)" value={r.easyPct != null ? `${r.easyPct} %` : '–'}
          tone={r.easyPct != null && r.easyPct < 75 ? 'brand' : 'default'} />
        <Figure label="Form (TSB)" value={`${tsbText(r.tsbStart)} → ${tsbText(r.tsbEnd)}`} />
      </div>

      {r.keys.length > 0 && (
        <ul className="mt-3 grid gap-1.5 text-body-sm">
          {r.keys.map((k) => {
            const { icon: Icon, tone } = KEY_ICON[k.status]
            return (
              <li key={k.date + k.status} className="flex items-start gap-2">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
                <span className="min-w-0">
                  <span className="text-muted-foreground tabular-nums">{format(parseISO(k.date), 'd.M.')}</span> {k.title}
                  <span className="text-muted-foreground"> · {k.text}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {r.engineChanges > 0 && (
        <p className="mt-2 text-caption text-muted-foreground">{r.engineChanges} automatische {r.engineChanges === 1 ? 'Anpassung' : 'Anpassungen'} in dieser Woche.</p>
      )}

      <p className="mt-3 border-l-2 border-l-brand pl-3 text-body-sm font-semibold">{r.focus}</p>

      {finished && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm">
          {stored
            ? <span className="text-muted-foreground">Deine Bewertung: Woche <span className="text-foreground">{RATING_LABEL[stored.rating]}</span>, Müdigkeit <span className="text-foreground">{FATIGUE_LABEL[stored.fatigue]}</span>{stored.note && <span className="block sm:inline sm:before:content-['_·_']">„{stored.note}“</span>}</span>
            : <span className="text-muted-foreground">Noch nicht bewertet.</span>}
          <Button size="sm" onClick={() => { save.reset(); setOpen(week) }} className="text-foreground">
            <MessageSquare /> {stored ? 'Bewertung ändern' : 'Woche bewerten'}
          </Button>
        </div>
      )}

      {open && overview && (
        <WeekFeedbackOverlay overview={overview} saved={feedback.byWeek[open.start]} feel={feel}
          saving={save.isPending} error={save.isError ? (save.error as Error).message : null}
          onLater={later} onSave={(e) => save.mutate({ week: open.start, ...e })} />
      )}
    </Card>
  )
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="tap grid h-8 w-8 place-items-center rounded-control text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
      {children}
    </button>
  )
}
