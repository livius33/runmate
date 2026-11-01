'use client'

// Overlay Wochenfeedback (07-26): the finished week as a sheet (phone) or modal (desktop), with the runner's rating.
// Radix Dialog gives the focus trap, Esc, aria-modal and the focus return; the content is the week overview.
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowRight, Check, Clock, X } from 'lucide-react'
import { fmtKm } from '@/lib/plan/format'
import { cn } from '@/lib/utils'
import { acwrText, type DayStrip, type WeekOverview } from '@/lib/insights/week-overlay'
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
  const { review: r, days, load, next } = overview
  const [rating, setRating] = useState<Score | null>(saved?.rating ?? null)
  const [fatigue, setFatigue] = useState<Score | null>(saved?.fatigue ?? null)
  const [note, setNote] = useState(saved?.note ?? '')
  const complete = rating != null && fatigue != null
  const range = `${format(parseISO(r.week.start), 'd.M.')}–${format(parseISO(r.week.end), 'd.M.')}`

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onLater() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-foreground/40 backdrop-blur-[2px]" />
        <Dialog.Content aria-describedby="week-feedback-sub"
          className={cn('fixed z-[1210] flex flex-col bg-card text-foreground shadow-2xl outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(52rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl')}>
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3 px-4 pt-3 sm:px-6 sm:pt-5">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight">Wochenrückblick KW {r.week.kw}</Dialog.Title>
              <p id="week-feedback-sub" className="text-sm text-muted-foreground">{range} · {r.week.focus}</p>
            </div>
            <Dialog.Close aria-label="Später" className="tap -mr-1.5 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
            <WeekStrip days={days} />

            <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6">
              <Stat label="Umfang" value={`${fmtKm(r.km)}/${r.targetKm}`} unit={`km · ${r.pct} %`}
                className={r.pct < 90 ? '[&_div:last-child]:text-brand' : undefined} />
              <Stat label="Läufe" value={`${r.runs}/${overview.plannedRuns}`} />
              <Stat label="Locker (Z1+Z2)" value={r.easyPct != null ? `${r.easyPct} %` : '–'}
                className={r.easyPct != null && r.easyPct < 75 ? '[&_div:last-child]:text-brand' : undefined} />
              <Stat label="Form (TSB)" value={`${signed(r.tsbStart)} → ${signed(r.tsbEnd)}`} />
              <Stat label="Fitness (CTL)" value={load.ctlStart != null && load.ctlEnd != null ? `${load.ctlStart} → ${load.ctlEnd}` : '–'}
                unit={load.atlEnd != null ? `ATL ${load.atlEnd}` : undefined} />
              <Stat label="Belastung (ACWR)" value={load.acwr != null ? load.acwr.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–'}
                className={load.acwr != null && load.acwr > 1.5 ? '[&_div:last-child]:text-brand' : undefined} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Belastung {acwrText(load.acwr)}{feel && feel.n > 0 && <> · Gefühl Ø {feel.avgFeel.toLocaleString('de-DE', { maximumFractionDigits: 1 })}/5 bei {feel.n} {feel.n === 1 ? 'Lauf' : 'Läufen'}{feel.pain > 0 && <span className="text-brand">, {feel.pain}× Schmerz</span>}</>}
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <section aria-labelledby="wf-keys">
                <h3 id="wf-keys" className="text-sm font-semibold">Kerneinheiten</h3>
                {r.keys.length === 0 ? <p className="mt-1.5 text-sm text-muted-foreground">Keine Kerneinheit in dieser Woche.</p> : (
                  <ul className="mt-1.5 grid gap-1.5 text-sm">
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
                )}
                <h3 className="mt-4 text-sm font-semibold">Plan-Anpassungen</h3>
                {overview.engine.length === 0 ? <p className="mt-1.5 text-sm text-muted-foreground">Der Plan blieb, wie er war.</p> : (
                  <ul className="mt-1.5 grid gap-1.5 text-sm">
                    {overview.engine.map((c) => (
                      <li key={c.id}><span className="text-muted-foreground tabular-nums">{format(parseISO(c.at), 'd.M.', { locale: de })}</span> {c.reason}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="wf-runs">
                <h3 id="wf-runs" className="text-sm font-semibold">Besondere Läufe</h3>
                {overview.notable.length === 0 ? <p className="mt-1.5 text-sm text-muted-foreground">Nichts, was heraussticht.</p> : (
                  <ul className="mt-1.5 grid gap-1.5 text-sm">
                    {overview.notable.map((n) => <li key={n.kind}>{n.text}</li>)}
                  </ul>
                )}
                <h3 className="mt-4 text-sm font-semibold">Nächste Woche</h3>
                {next ? (
                  <p className="mt-1.5 text-sm">
                    KW {next.kw} · {next.km} km · {next.focus}
                    {next.keys.length > 0 && <span className="block text-muted-foreground">Kerneinheiten: {next.keys.join(', ')}</span>}
                  </p>
                ) : <p className="mt-1.5 text-sm text-muted-foreground">Der Plan endet mit dieser Woche.</p>}
              </section>
            </div>

            <p className="mt-5 border-l-4 border-l-brand pl-3 text-sm font-semibold leading-snug">{r.focus}</p>

            <form className="mt-6 border-t border-border pt-5" onSubmit={(e) => { e.preventDefault(); if (complete) onSave({ rating, fatigue, note }) }}>
              <h3 className="text-sm font-semibold">Wie war die Woche für dich?</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <ScoreRow label="Woche" value={rating} labels={RATING_LABEL} onChange={setRating} disabled={saving} />
                <ScoreRow label="Müdigkeit" value={fatigue} labels={FATIGUE_LABEL} onChange={setFatigue} disabled={saving} />
              </div>
              <label className="mt-4 block text-sm">
                <span className="font-medium">Notiz</span> <span className="text-muted-foreground">(optional)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} disabled={saving} rows={2} maxLength={NOTE_MAX}
                  placeholder="Was war anders als geplant? Schlaf, Stress, Schmerzen …"
                  className="mt-1.5 w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-foreground/60" />
              </label>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
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

// Seven columns, planned km as the quiet bar behind, run km in front; a missed run day is outlined in red.
function WeekStrip({ days }: { days: DayStrip[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.plannedKm, d.actualKm)))
  const h = (km: number) => `${Math.round((km / max) * 100)}%`
  return (
    <ol className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2" aria-label="Plan und gelaufen pro Tag">
      {days.map((d) => {
        const missed = d.status === 'missed'
        const text = d.ran ? `${fmtKm(d.actualKm)} km gelaufen${d.plannedKm ? `, ${fmtKm(d.plannedKm)} geplant` : ', ohne Plan'}`
          : missed ? `${fmtKm(d.plannedKm)} km geplant, nicht gelaufen` : d.status === 'paused' ? 'Pause' : d.plannedKm ? `${fmtKm(d.plannedKm)} km geplant` : 'Ruhetag'
        return (
          <li key={d.date} className="min-w-0" aria-label={`${d.label} ${format(parseISO(d.date), 'd.M.')}: ${text}`}>
            <div className="relative h-16 rounded-md bg-secondary/60 sm:h-20">
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
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value != null ? labels[value] : `1 = ${labels[1]} · 5 = ${labels[5]}`}</span>
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5" role="group" aria-label={label}>
        {SCORES.map((s) => (
          <button key={s} type="button" aria-pressed={value === s} aria-label={`${s} – ${labels[s]}`} disabled={disabled} onClick={() => onChange(s)}
            className={cn('tap h-10 rounded-lg border text-sm font-semibold tabular-nums transition-colors',
              value === s ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/50 disabled:opacity-50')}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
