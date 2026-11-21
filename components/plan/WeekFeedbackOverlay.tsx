'use client'

// Overlay Wochenfeedback (07-26): the finished week as a sheet (phone) or modal (desktop), with the runner's rating.
// DialogShell gives the focus trap, Esc, aria-modal and the focus return. Short and crisp (12-02): the week strip, three
// figures, the one thing to take along and the rating fit a 390 × 844 screen with the action visible; everything else
// sits behind "Details" (11-02).
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowRight, Check, ChevronDown, Clock, Plus, X } from 'lucide-react'
import { fmtKm } from '@/lib/plan/format'
import { cn } from '@/lib/utils'
import { acwrText, weekFigures, type DayStrip, type WeekOverview } from '@/lib/insights/week-overlay'
import type { KeyResult } from '@/lib/insights/week'
import { FATIGUE_LABEL, NOTE_MAX, RATING_LABEL, type Score, type WeekFeedbackEntry } from '@/lib/feedback/week'
import { Button } from '@/components/ui/button'
import { DialogShell } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/field'
import { Figure } from '@/components/ui/figure'

const SCORES: Score[] = [1, 2, 3, 4, 5]
const FORM_ID = 'week-feedback-form'
const signed = (n: number | null) => (n == null ? '–' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}`)
const KEY_ICON: Record<KeyResult['status'], { icon: typeof Check; tone: string }> = {
  done: { icon: Check, tone: 'text-teal' },
  missed: { icon: X, tone: 'text-brand' },
  moved: { icon: ArrowRight, tone: 'text-warning' },
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
  const [noteOpen, setNoteOpen] = useState(false)          // a saved note shows as one line until "ändern"
  const [details, setDetails] = useState(false)
  const complete = rating != null && fatigue != null
  const range = `${format(parseISO(r.week.start), 'd.M.')}–${format(parseISO(r.week.end), 'd.M.')}`
  const f = weekFigures(overview)

  // The close button is "Später" (the week is offered again on the next visit), so the footer holds one action only.
  return (
    <DialogShell onOpenChange={(open) => { if (!open) onLater() }} closeLabel="Später"
      title={`Wochenrückblick KW ${r.week.kw}`}
      description={<>{range} · {r.week.focus}{saved && <span className="sm:hidden"> · Gespeichert am {format(parseISO(saved.at), 'd.M.')}</span>}</>}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {error ? <p className="mr-auto text-caption text-error" role="alert">{error}</p>
            : saved ? <p className="mr-auto hidden text-caption text-muted-foreground sm:block">Gespeichert am {format(parseISO(saved.at), "d.M. 'um' HH:mm", { locale: de })}</p> : null}
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!complete || saving} className="w-full sm:w-auto">
            {saving ? 'Speichert …' : saved ? 'Bewertung aktualisieren' : 'Bewertung speichern'}
          </Button>
        </div>
      }>
      <WeekStrip days={days} />

      <div className="mt-3 grid grid-cols-3 gap-x-3">
        <Figure label={`Umfang · ${r.pct} %`} value={f.km} unit="km" tone={r.pct < 90 ? 'brand' : 'default'} />
        <Figure label={f.runsLabel} value={f.runs} />
        <Figure label={f.keysLabel} value={f.keys ?? '–'} tone={r.keys.some((k) => k.status === 'missed') ? 'brand' : 'default'} />
      </div>

      <p className="mt-3 border-l-2 border-l-brand pl-3 text-body-sm font-semibold">{r.focus}</p>

      <button type="button" aria-expanded={details} aria-controls="week-feedback-details" onClick={() => setDetails(!details)}
        className="tap mt-2 inline-flex items-center gap-1 rounded-control text-caption font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', details && 'rotate-180')} aria-hidden />
        {details ? 'Details ausblenden' : 'Details'}
      </button>
      {details && <div id="week-feedback-details"><WeekDetails overview={overview} feel={feel} /></div>}

      <form id={FORM_ID} className="mt-3 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); if (complete) onSave({ rating, fatigue, note }) }}>
        <h3 className="sr-only">Wie war die Woche für dich?</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <ScoreRow label="Woche" value={rating} labels={RATING_LABEL} onChange={setRating} disabled={saving} />
          <ScoreRow label="Müdigkeit" value={fatigue} labels={FATIGUE_LABEL} onChange={setFatigue} disabled={saving} />
        </div>
        {noteOpen ? (
          <label className="mt-3 block text-body-sm">
            <span className="font-medium">Notiz</span> <span className="text-muted-foreground">(optional)</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} disabled={saving} rows={2} maxLength={NOTE_MAX}
              autoFocus placeholder="Was war anders als geplant? Schlaf, Stress, Schmerzen …" className="mt-1.5" />
          </label>
        ) : note ? (
          <p className="mt-2 flex min-w-0 items-center gap-2 text-caption">
            <span className="min-w-0 truncate text-muted-foreground">Notiz: „{note}“</span>
            <button type="button" onClick={() => setNoteOpen(true)} disabled={saving}
              className="tap shrink-0 rounded-control font-medium text-foreground underline underline-offset-2">ändern</button>
          </p>
        ) : (
          <button type="button" onClick={() => setNoteOpen(true)} disabled={saving}
            className="tap mt-2 inline-flex items-center gap-1 rounded-control text-caption font-medium text-muted-foreground hover:text-foreground">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Notiz hinzufügen
          </button>
        )}
      </form>
    </DialogShell>
  )
}

// What the long version showed, one tap away. A list with nothing in it is left out.
function WeekDetails({ overview, feel }: { overview: WeekOverview; feel?: RunFeelSummary | null }) {
  const { review: r, load, next } = overview
  return (
    <div className="mt-2 grid gap-3 text-body-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Locker (Z1+Z2)" value={r.easyPct != null ? `${r.easyPct} %` : '–'}
          tone={r.easyPct != null && r.easyPct < 75 ? 'brand' : 'default'} />
        <Figure label="Form (TSB)" value={`${signed(r.tsbStart)} → ${signed(r.tsbEnd)}`} />
        <Figure label="Fitness (CTL)" value={load.ctlStart != null && load.ctlEnd != null ? `${load.ctlStart} → ${load.ctlEnd}` : '–'}
          unit={load.atlEnd != null ? `ATL ${load.atlEnd}` : undefined} />
        <Figure label="Belastung (ACWR)" value={load.acwr != null ? load.acwr.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'}
          tone={load.acwr != null && load.acwr > 1.5 ? 'brand' : 'default'} />
      </div>
      <p className="-mt-1 text-caption text-muted-foreground">
        Belastung {acwrText(load.acwr)}{feel && feel.n > 0 && <> · Gefühl Ø {feel.avgFeel.toLocaleString('de-DE', { maximumFractionDigits: 1 })}/5 bei {feel.n} {feel.n === 1 ? 'Lauf' : 'Läufen'}{feel.pain > 0 && <span className="text-brand">, {feel.pain}× Schmerz</span>}</>}
      </p>

      {r.keys.length > 0 && (
        <section aria-labelledby="wf-keys">
          <h3 id="wf-keys" className="text-caption font-semibold text-muted-foreground">Kerneinheiten</h3>
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
          <h3 id="wf-engine" className="text-caption font-semibold text-muted-foreground">Plan-Anpassungen</h3>
          <ul className="mt-1 grid gap-1">
            {overview.engine.map((c) => (
              <li key={c.id}><span className="text-muted-foreground tabular-nums">{format(parseISO(c.at), 'd.M.', { locale: de })}</span> {c.reason}</li>
            ))}
          </ul>
        </section>
      )}
      {overview.notable.length > 0 && (
        <section aria-labelledby="wf-runs">
          <h3 id="wf-runs" className="text-caption font-semibold text-muted-foreground">Besondere Läufe</h3>
          <ul className="mt-1 grid gap-1">
            {overview.notable.map((n) => <li key={n.kind}>{n.text}</li>)}
          </ul>
        </section>
      )}
      <section aria-labelledby="wf-next">
        <h3 id="wf-next" className="text-caption font-semibold text-muted-foreground">Nächste Woche</h3>
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

// Seven columns, planned km as the quiet bar behind, run km in front; a missed run day is outlined in red. Under each
// bar the weekday and the km (run, else planned); the difference to the plan is in the bar and in the screen reader text.
function WeekStrip({ days }: { days: DayStrip[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.plannedKm, d.actualKm)))
  const h = (km: number) => `${Math.round((km / max) * 100)}%`
  return (
    <ol className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-label="Plan und gelaufen pro Tag">
      {days.map((d) => {
        const missed = d.status === 'missed'
        const text = d.ran ? `${fmtKm(d.actualKm)} km gelaufen${d.plannedKm ? `, ${fmtKm(d.plannedKm)} geplant` : ', ohne Plan'}`
          : missed ? `${fmtKm(d.plannedKm)} km geplant, nicht gelaufen` : d.status === 'paused' ? 'Pause' : d.plannedKm ? `${fmtKm(d.plannedKm)} km geplant` : 'Ruhetag'
        return (
          <li key={d.date} className="min-w-0" aria-label={`${d.label} ${format(parseISO(d.date), 'd.M.')}: ${text}`}>
            <div className="relative h-8 rounded-control bg-secondary sm:h-10">
              {d.plannedKm > 0 && (
                <div className={cn('absolute inset-x-0 bottom-0 rounded-control', missed ? 'border border-brand/60 bg-brand-soft' : 'bg-border')} style={{ height: h(d.plannedKm) }} />
              )}
              {d.actualKm > 0 && (
                <div className="absolute inset-x-1.5 bottom-0 rounded-control bg-teal sm:inset-x-2" style={{ height: h(d.actualKm) }} />
              )}
              {d.key && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
            </div>
            <div className="mt-1 text-center text-caption" aria-hidden>
              <div className="font-medium">{d.label}</div>
              <div className={cn('tabular-nums', d.ran ? 'text-foreground' : missed ? 'text-brand' : 'text-muted-foreground')}>
                {d.ran ? fmtKm(d.actualKm) : d.plannedKm ? fmtKm(d.plannedKm) : '–'}
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
      <div className="flex items-baseline justify-between gap-2 text-body-sm">
        <span className="font-medium">{label}</span>
        <span className="min-w-0 truncate text-caption text-muted-foreground">{value != null ? labels[value] : `1 = ${labels[1]} · 5 = ${labels[5]}`}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5" role="group" aria-label={label}>
        {SCORES.map((s) => (
          <button key={s} type="button" aria-pressed={value === s} aria-label={`${s} – ${labels[s]}`} disabled={disabled} onClick={() => onChange(s)}
            className={cn('tap h-10 rounded-control text-body-sm font-semibold tabular-nums transition-colors sm:h-9',
              value === s ? 'bg-foreground text-background' : 'bg-card shadow-hairline hover:bg-secondary disabled:opacity-50')}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
