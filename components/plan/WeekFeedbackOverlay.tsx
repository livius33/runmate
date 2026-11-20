'use client'

// Overlay Wochenfeedback (07-26): the finished week as a sheet (phone) or modal (desktop), with the runner's rating.
// Radix Dialog gives the focus trap, Esc, aria-modal and the focus return; the content is the week overview, short
// first and complete behind "Details" (11-02).
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowRight, Check, ChevronDown, Clock, Plus, X } from 'lucide-react'
import { fmtKm } from '@/lib/plan/format'
import { cn } from '@/lib/utils'
import { acwrText, weekFigures, type DayStrip, type WeekOverview } from '@/lib/insights/week-overlay'
import type { KeyResult } from '@/lib/insights/week'
import { FATIGUE_LABEL, NOTE_MAX, RATING_LABEL, type Score, type WeekFeedbackEntry } from '@/lib/feedback/week'
import { Stat } from './ui'

const SCORES: Score[] = [1, 2, 3, 4, 5]
const signed = (n: number | null) => (n == null ? '–' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}`)
const KEY_ICON: Record<KeyResult['status'], { icon: typeof Check; tone: string }> = {
  done: { icon: Check, tone: 'text-teal' },
  missed: { icon: X, tone: 'text-brand' },
  moved: { icon: ArrowRight, tone: 'text-amber-700' },
  open: { icon: Clock, tone: 'text-muted-foreground' },
}

export interface RunFeelSummary { n: number; avgFeel: number; pain: number }

export function WeekFeedbackOverlay({ overview, saved, feel, saving, error, onLater, onSave }: {
  overview: WeekOverview
  saved?: WeekFeedbackEntry
  feel?: RunFeelSummary | null
  saving: boolean
  error: string | null
  onLater: () => void
  onSave: (entry: { rating: Score; fatigue: Score; note: string }) => void
}) {
  const { review: r, days } = overview
  const [rating, setRating] = useState<Score | null>(saved?.rating ?? null)
  const [fatigue, setFatigue] = useState<Score | null>(saved?.fatigue ?? null)
  const [note, setNote] = useState(saved?.note ?? '')
  const [noteOpen, setNoteOpen] = useState(!!saved?.note)
  const [details, setDetails] = useState(false)
  const complete = rating != null && fatigue != null
  const range = `${format(parseISO(r.week.start), 'd.M.')}–${format(parseISO(r.week.end), 'd.M.')}`
  const f = weekFigures(overview)

  // The first view is the week in three figures, the one thing to take along and the rating (11-02): it fits a phone
  // screen without scrolling. Everything else sits behind "Details".
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onLater() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-foreground/40 backdrop-blur-[2px]" />
        <Dialog.Content aria-describedby="week-feedback-sub"
          className={cn('fixed z-[1210] flex flex-col bg-card text-foreground shadow-2xl outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(34rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl')}>
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-4 pt-3 sm:px-5 sm:pt-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-tight">Wochenrückblick KW {r.week.kw}</Dialog.Title>
              <p id="week-feedback-sub" className="text-xs text-muted-foreground">{range} · {r.week.focus}</p>
            </div>
            <Dialog.Close aria-label="Später" className="tap -mr-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
            <WeekStrip days={days} />

            <div className="mt-3 grid grid-cols-3 gap-x-3">
              <Stat label={`Umfang · ${r.pct} %`} value={f.km} unit="km"
                className={r.pct < 90 ? '[&_div:last-child]:text-brand' : undefined} />
              <Stat label={f.runsLabel} value={f.runs} />
              <Stat label={f.keysLabel} value={f.keys ?? '–'}
                className={r.keys.some((k) => k.status === 'missed') ? '[&_div:last-child]:text-brand' : undefined} />
            </div>

            <p className="mt-3 border-l-4 border-l-brand pl-3 text-sm font-semibold leading-snug">{r.focus}</p>

            <button type="button" aria-expanded={details} aria-controls="week-feedback-details" onClick={() => setDetails(!details)}
              className="tap mt-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', details && 'rotate-180')} aria-hidden />
              {details ? 'Details ausblenden' : 'Details'}
            </button>
            {details && <div id="week-feedback-details"><WeekDetails overview={overview} feel={feel} /></div>}

            <form className="mt-3 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); if (complete) onSave({ rating, fatigue, note }) }}>
              <h3 className="sr-only">Wie war die Woche für dich?</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <ScoreRow label="Woche" value={rating} labels={RATING_LABEL} onChange={setRating} disabled={saving} />
                <ScoreRow label="Müdigkeit" value={fatigue} labels={FATIGUE_LABEL} onChange={setFatigue} disabled={saving} />
              </div>
              {noteOpen ? (
                <label className="mt-3 block text-sm">
                  <span className="font-medium">Notiz</span> <span className="text-muted-foreground">(optional)</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} disabled={saving} rows={2} maxLength={NOTE_MAX}
                    autoFocus={!saved?.note} placeholder="Was war anders als geplant? Schlaf, Stress, Schmerzen …"
                    className="mt-1.5 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/60" />
                </label>
              ) : (
                <button type="button" onClick={() => setNoteOpen(true)} disabled={saving}
                  className="tap mt-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Notiz hinzufügen
                </button>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {error && <p className="mr-auto text-sm text-brand" role="alert">{error}</p>}
                {saved && !error && <p className="mr-auto text-xs text-muted-foreground">Gespeichert am {format(parseISO(saved.at), "d.M. 'um' HH:mm", { locale: de })}</p>}
                <button type="button" onClick={onLater} disabled={saving}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50">Später</button>
                <button type="submit" disabled={!complete || saving}
                  className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50">
                  {saving ? 'Speichert …' : saved ? 'Bewertung aktualisieren' : 'Bewertung speichern'}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// What the long version showed, one tap away. A list with nothing in it is left out.
function WeekDetails({ overview, feel }: { overview: WeekOverview; feel?: RunFeelSummary | null }) {
  const { review: r, load, next } = overview
  return (
    <div className="mt-3 grid gap-3 text-sm">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
        <Stat label="Locker (Z1+Z2)" value={r.easyPct != null ? `${r.easyPct} %` : '–'}
          className={r.easyPct != null && r.easyPct < 75 ? '[&_div:last-child]:text-brand' : undefined} />
        <Stat label="Form (TSB)" value={`${signed(r.tsbStart)} → ${signed(r.tsbEnd)}`} />
        <Stat label="Fitness (CTL)" value={load.ctlStart != null && load.ctlEnd != null ? `${load.ctlStart} → ${load.ctlEnd}` : '–'}
          unit={load.atlEnd != null ? `ATL ${load.atlEnd}` : undefined} />
        <Stat label="Belastung (ACWR)" value={load.acwr != null ? load.acwr.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'}
          className={load.acwr != null && load.acwr > 1.5 ? '[&_div:last-child]:text-brand' : undefined} />
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        Belastung {acwrText(load.acwr)}{feel && feel.n > 0 && <> · Gefühl Ø {feel.avgFeel.toLocaleString('de-DE', { maximumFractionDigits: 1 })}/5 bei {feel.n} {feel.n === 1 ? 'Lauf' : 'Läufen'}{feel.pain > 0 && <span className="text-brand">, {feel.pain}× Schmerz</span>}</>}
      </p>

      {r.keys.length > 0 && (
        <section aria-labelledby="wf-keys">
          <h3 id="wf-keys" className="text-xs font-semibold text-muted-foreground">Kerneinheiten</h3>
          <ul className="mt-1 grid gap-1">
            {r.keys.map((k) => {
              const { icon: Icon, tone } = KEY_ICON[k.status]
              return (
                <li key={k.date + k.status} className="flex items-start gap-2">
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-label={k.status === 'done' ? 'gelaufen' : k.status === 'missed' ? 'verpasst' : k.status === 'moved' ? 'verschoben' : 'offen'} />
                  <span className="min-w-0">
                    <span className="text-muted-foreground tabular-nums">{format(parseISO(k.date), 'd.M.')}</span> {k.title}
                    <span className="text-muted-foreground"> · {k.text}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {overview.engine.length > 0 && (
        <section aria-labelledby="wf-engine">
          <h3 id="wf-engine" className="text-xs font-semibold text-muted-foreground">Plan-Anpassungen</h3>
          <ul className="mt-1 grid gap-1">
            {overview.engine.map((c) => (
              <li key={c.id}><span className="text-muted-foreground tabular-nums">{format(parseISO(c.at), 'd.M.', { locale: de })}</span> {c.reason}</li>
            ))}
          </ul>
        </section>
      )}
      {overview.notable.length > 0 && (
        <section aria-labelledby="wf-runs">
          <h3 id="wf-runs" className="text-xs font-semibold text-muted-foreground">Besondere Läufe</h3>
          <ul className="mt-1 grid gap-1">
            {overview.notable.map((n) => <li key={n.kind}>{n.text}</li>)}
          </ul>
        </section>
      )}
      <section aria-labelledby="wf-next">
        <h3 id="wf-next" className="text-xs font-semibold text-muted-foreground">Nächste Woche</h3>
        {next ? (
          <p className="mt-1">
            KW {next.kw} · {fmtKm(next.km)} km · {next.focus}
            {next.keys.length > 0 && <span className="block text-muted-foreground">Kerneinheiten: {next.keys.join(', ')}</span>}
          </p>
        ) : <p className="mt-1 text-muted-foreground">Der Plan endet mit dieser Woche.</p>}
      </section>
    </div>
  )
}

// Seven columns, planned km as the quiet bar behind, run km in front; a missed run day is outlined in red.
function WeekStrip({ days }: { days: DayStrip[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.plannedKm, d.actualKm)))
  const h = (km: number) => `${Math.round((km / max) * 100)}%`
  return (
    <ol className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2" aria-label="Plan und gelaufen pro Tag">
      {days.map((d) => {
        const missed = d.status === 'missed'
        const text = d.ran ? `${fmtKm(d.actualKm)} km gelaufen${d.plannedKm ? `, ${fmtKm(d.plannedKm)} geplant` : ', ohne Plan'}`
          : missed ? `${fmtKm(d.plannedKm)} km geplant, nicht gelaufen` : d.status === 'paused' ? 'Pause' : d.plannedKm ? `${fmtKm(d.plannedKm)} km geplant` : 'Ruhetag'
        return (
          <li key={d.date} className="min-w-0" aria-label={`${d.label} ${format(parseISO(d.date), 'd.M.')}: ${text}`}>
            <div className="relative h-10 rounded-md bg-secondary/60 sm:h-12">
              {d.plannedKm > 0 && (
                <div className={cn('absolute inset-x-0 bottom-0 rounded-md', missed ? 'border border-brand/60 bg-brand-soft' : 'bg-border/80')} style={{ height: h(d.plannedKm) }} />
              )}
              {d.actualKm > 0 && (
                <div className="absolute inset-x-1.5 bottom-0 rounded-md bg-teal sm:inset-x-2" style={{ height: h(d.actualKm) }} />
              )}
              {d.key && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
            </div>
            <div className="mt-1 text-center text-[11px] leading-tight">
              <div className="font-medium">{d.label}</div>
              <div className={cn('tabular-nums', d.ran ? 'text-foreground' : missed ? 'text-brand' : 'text-muted-foreground')}>
                {d.ran ? fmtKm(d.actualKm) : d.plannedKm ? fmtKm(d.plannedKm) : '–'}
                {d.diffKm != null && <span className={cn('ml-0.5', d.diffKm < 0 ? 'text-brand' : 'text-muted-foreground')}>{d.diffKm > 0 ? '+' : '−'}{fmtKm(Math.abs(d.diffKm))}</span>}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ScoreRow({ label, value, labels, onChange, disabled }: {
  label: string; value: Score | null; labels: Record<Score, string>; onChange: (v: Score) => void; disabled: boolean
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{value != null ? labels[value] : `1 = ${labels[1]} · 5 = ${labels[5]}`}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5" role="group" aria-label={label}>
        {SCORES.map((s) => (
          <button key={s} type="button" aria-pressed={value === s} aria-label={`${s} – ${labels[s]}`} disabled={disabled} onClick={() => onChange(s)}
            className={cn('tap h-9 rounded-lg border text-sm font-semibold tabular-nums transition-colors',
              value === s ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/50 disabled:opacity-50')}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
