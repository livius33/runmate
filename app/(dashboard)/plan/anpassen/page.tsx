'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Check, History, Lightbulb, RotateCcw, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, TypeTag } from '@/components/plan/ui'
import { PauseControl } from '@/components/plan/PauseControl'
import { useToday } from '@/lib/use-today'
import type { FeedbackHint } from '@/lib/feedback/rules'
import { Onboarding, ProfileOverview } from '@/components/plan/workshop/Onboarding'
import { type PlanSession } from '@/lib/plan/types'
import { fmtKm } from '@/lib/plan/format'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import type { Period, PeriodReview, Suggestion, WorkshopEvent, WorkshopLogEntry } from '@/lib/plan/workshop'

type Data = { period: Period; events: WorkshopEvent[]; review: PeriodReview; suggestions: Suggestion[]; hints: FeedbackHint[]; log: WorkshopLogEntry[]; profile: AthleteProfile | null }
type ProfileData = { profile: AthleteProfile | null; prefill: AthleteProfile; events: WorkshopEvent[]; connections: { garminSync: string | null; calendar: boolean; appleHealth: boolean } }
type Choice = { p: string; from?: string; to?: string }

const CHOICES: { p: string; label: string }[] = [
  { p: 'event', label: 'Bis zum nächsten Rennen' }, { p: '2w', label: '2 Wochen' }, { p: '4w', label: '4 Wochen' }, { p: 'range', label: 'Von–bis' },
]
const day = (d: string) => format(parseISO(d), 'EEEEEE d.M.', { locale: de })
const qs = (c: Choice) => new URLSearchParams(Object.entries(c).filter(([, v]) => v) as [string, string][]).toString()

async function post(body: unknown) {
  const r = await fetch('/api/running/workshop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? 'Speichern fehlgeschlagen')
  return d
}

// Plan-Werkstatt: pick a period, see how it is going, apply rule-based suggestions (with diff) and undo them.
export default function WorkshopPage() {
  const qc = useQueryClient()
  const today = useToday()
  const [choice, setChoice] = useState<Choice>({ p: 'event' })
  const [range, setRange] = useState({ from: '', to: '' })
  // null = workshop; 'overview' = all profile answers; a number = edit that onboarding step alone
  const [profileView, setProfileView] = useState<null | 'overview' | number>(null)
  const [note, setNote] = useState<string | null>(null)

  const prof = useQuery<ProfileData>({ queryKey: ['athlete-profile'], queryFn: () => fetch('/api/running/profile').then((r) => r.json()) })
  const ready = choice.p !== 'range' || (choice.from && choice.to)
  const { data, isLoading, isError } = useQuery<Data>({
    queryKey: ['workshop', choice],
    queryFn: () => fetch(`/api/running/workshop?${qs(choice)}`).then((r) => { if (!r.ok) throw new Error(); return r.json() }),
    enabled: !!ready && !!prof.data?.profile,
  })
  const refresh = () => ['workshop', 'plan-overrides', 'plan-engine', 'plan-actuals'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))

  const saveProfile = useMutation({
    mutationFn: async (profile: AthleteProfile) => {
      const r = await fetch('/api/running/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Speichern fehlgeschlagen')
    },
    onSuccess: () => { setProfileView((v) => (v == null ? null : 'overview')); qc.invalidateQueries({ queryKey: ['athlete-profile'] }); refresh() },
  })
  const apply = useMutation({
    mutationFn: (id: string) => post({ action: 'apply', id, ...choice }),
    onSuccess: () => { setNote('Übernommen. Im Wochenplan und im Kalender als deine Änderung sichtbar.'); refresh() },
  })
  const undo = useMutation({
    mutationFn: (entryId: string) => post({ action: 'undo', entryId }),
    onSuccess: (d: { changedSince?: string[] }) => { setNote(d.changedSince?.length ? `Rückgängig. Achtung: ${d.changedSince.length} Tag(e) hattest du danach noch geändert, sie sind jetzt wieder wie vorher.` : 'Rückgängig gemacht.'); refresh() },
  })

  if (prof.isLoading) return <p className="text-sm text-muted-foreground">Lädt…</p>
  if (prof.data && (!prof.data.profile || typeof profileView === 'number')) {
    return (
      <div className="pb-10">
        <Onboarding key={String(profileView)} initial={prof.data.profile ?? prof.data.prefill} events={prof.data.events} connections={prof.data.connections}
          onSave={(p) => saveProfile.mutate(p)} saving={saveProfile.isPending} error={(saveProfile.error as Error | null)?.message}
          only={typeof profileView === 'number' ? profileView : undefined}
          onCancel={prof.data.profile ? () => { saveProfile.reset(); setProfileView('overview') } : undefined} />
      </div>
    )
  }
  if (prof.data?.profile && profileView === 'overview') {
    return (
      <div className="pb-10">
        <ProfileOverview profile={prof.data.profile} events={prof.data.events} connections={prof.data.connections}
          onEdit={(step) => setProfileView(step)} onBack={() => setProfileView(null)} />
      </div>
    )
  }

  const error = [apply, undo].find((m) => m.isError)?.error as Error | undefined
  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Plan</Link>
          <h1 className="mt-1 text-2xl sm:text-[28px] font-semibold tracking-tight">Plan anpassen</h1>
          <p className="mt-1 text-sm text-muted-foreground">Zeitraum wählen, prüfen, Vorschläge übernehmen. Feste Regeln, nichts ändert sich ohne dich.</p>
        </div>
        <button onClick={() => setProfileView('overview')} className="tap inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary">
          <Settings2 className="h-3.5 w-3.5" /> Trainingsprofil
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zeitraum">
        {CHOICES.map((c) => (
          <button key={c.p} aria-pressed={choice.p === c.p}
            onClick={() => setChoice(c.p === 'range' ? { p: 'range', from: range.from || undefined, to: range.to || undefined } : { p: c.p })}
            className={cn('tap rounded-full border px-3 py-1.5 text-sm', choice.p === c.p ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
            {c.label}
          </button>
        ))}
        {choice.p === 'range' && (
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            <input type="date" value={range.from} onChange={(e) => { const r = { ...range, from: e.target.value }; setRange(r); setChoice({ p: 'range', from: r.from || undefined, to: r.to || undefined }) }} className="rounded-lg border border-border bg-card px-2 py-1" aria-label="Von" />
            –
            <input type="date" value={range.to} onChange={(e) => { const r = { ...range, to: e.target.value }; setRange(r); setChoice({ p: 'range', from: r.from || undefined, to: r.to || undefined }) }} className="rounded-lg border border-border bg-card px-2 py-1" aria-label="Bis" />
          </span>
        )}
      </div>

      {note && <p className="flex items-center gap-1.5 text-sm text-teal"><Check className="h-4 w-4" />{note}</p>}
      {error && <p className="flex items-center gap-1.5 text-sm text-brand"><AlertTriangle className="h-4 w-4" />{error.message}</p>}
      {!ready && <p className="text-sm text-muted-foreground">Start- und Enddatum wählen.</p>}
      {isLoading && ready && <p className="text-sm text-muted-foreground">Rechnet…</p>}
      {isError && <p className="text-sm text-brand">Konnte nicht geladen werden. Seite neu laden.</p>}

      {data && (
        <>
          <Overview d={data} />
          <Card title="Vorschläge" aside={<span className="text-xs text-muted-foreground">{data.period.label}</span>}>
            {data.hints?.length > 0 && (
              <ul className="mb-4 grid gap-2 text-sm" aria-label="Aus deinem Feedback">
                {data.hints.map((h) => (
                  <li key={h.kind} className={cn('rounded-xl px-3.5 py-2.5', h.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-teal-soft/70')}>
                    <span className="flex items-start gap-2">
                      {h.tone === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />}
                      <span>{h.text}</span>
                    </span>
                    {h.pause && <PauseControl today={today} />}
                  </li>
                ))}
              </ul>
            )}
            {data.suggestions.length === 0 ? (
              <p className="flex items-start gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                Nichts zu ändern: Umfang, Form und Schlüsseleinheiten passen in diesem Zeitraum.</p>
            ) : (
              <ul className="grid gap-4">
                {data.suggestions.map((s) => <SuggestionCard key={s.id} s={s} busy={apply.isPending} onApply={() => apply.mutate(s.id)} />)}
              </ul>
            )}
          </Card>
          <Card title="Verlauf" aside={<History className="h-4 w-4 text-muted-foreground" />}>
            {data.log.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Änderungen über „Plan anpassen“.</p> : (
              <ul className="grid gap-2 text-sm">
                {data.log.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
                    <span className="min-w-0">
                      <span className={cn('font-medium', e.undoneAt && 'text-muted-foreground line-through')}>{e.title}</span>
                      <span className="block text-xs text-muted-foreground">{format(parseISO(e.at), 'd.M. HH:mm')} · {e.period} · {Object.keys(e.after).length} Tag(e)</span>
                    </span>
                    {e.undoneAt ? <span className="text-xs text-muted-foreground">rückgängig</span> : (
                      <button onClick={() => undo.mutate(e.id)} disabled={undo.isPending}
                        className="tap inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50">
                        <RotateCcw className="h-3 w-3" /> Rückgängig
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Overview({ d }: { d: Data }) {
  const t = d.review.totals
  const f = d.review.fitness
  const r = d.review.recent
  return (
    <Card title={d.period.label} aside={<span className="text-xs text-muted-foreground tabular-nums">{day(d.period.from)} – {day(d.period.to)}</span>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Geplant" value={`${fmtKm(t.plannedKm)} km`} />
        <Kpi label="Gelaufen" value={`${fmtKm(t.runKm)} km`} />
        <Kpi label="Noch offen" value={`${fmtKm(t.remainingKm)} km`} />
        <Kpi label="Verpasst / extra" value={`${fmtKm(t.missedKm)} / ${fmtKm(t.extraKm)} km`} tone={t.missedKm >= 5 ? 'warn' : undefined} />
        <Kpi label="Schlüsseleinheiten" value={`${d.review.key.done} gelaufen · ${d.review.key.open} offen`} sub={d.review.key.missed ? `${d.review.key.missed} verpasst` : undefined} tone={d.review.key.missed ? 'warn' : undefined} />
        <Kpi label="Form (TSB)" value={f.tsb == null ? '–' : String(Math.round(f.tsb)).replace('-', '−')} tone={f.tsb != null && f.tsb < -25 ? 'warn' : undefined} />
        <Kpi label="ACWR" value={f.acwr == null ? '–' : f.acwr.toFixed(2).replace('.', ',')} tone={f.acwr != null && f.acwr > 1.5 ? 'warn' : undefined} />
        <Kpi label={`Letzte ${r?.weeks ?? 3} Wochen`} value={r ? `${Math.round(r.ratio * 100)} % vom Plan` : '–'} sub={r ? `${fmtKm(r.runKm)} von ${fmtKm(r.plannedKm)} km` : undefined} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm tabular-nums">
          <thead><tr className="text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">Woche</th><th className="py-1.5 pr-3 text-right font-medium">Ziel</th>
            <th className="py-1.5 pr-3 text-right font-medium">Geplant</th><th className="py-1.5 pr-3 text-right font-medium">Gelaufen</th>
            <th className="py-1.5 text-right font-medium">Offen</th>
          </tr></thead>
          <tbody>
            {d.review.weeks.map((w) => (
              <tr key={w.start} className="border-t border-border">
                <td className="py-1.5 pr-3">{w.kw ? `KW ${w.kw}` : day(w.start)}{w.focus && <span className="ml-1.5 text-xs text-muted-foreground">{w.focus}</span>}</td>
                <td className="py-1.5 pr-3 text-right text-muted-foreground">{w.targetKm != null ? fmtKm(w.targetKm) : '–'}</td>
                <td className="py-1.5 pr-3 text-right">{fmtKm(w.plannedKm)}</td>
                <td className="py-1.5 pr-3 text-right">{fmtKm(w.runKm)}{w.missedKm > 0 && <span className="ml-1 text-xs text-brand">−{fmtKm(w.missedKm)}</span>}</td>
                <td className="py-1.5 text-right">{fmtKm(w.remainingKm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-xl bg-secondary/60 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-semibold tabular-nums', tone === 'warn' && 'text-brand')}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  )
}

function SessionCell({ s }: { s: PlanSession | null }) {
  if (!s || s.type === 'rest') return <span className="text-muted-foreground">Ruhetag</span>
  return <span className="flex min-w-0 items-center gap-1.5"><TypeTag type={s.type} /><span className="truncate">{s.title}</span><span className="shrink-0 tabular-nums text-muted-foreground">{fmtKm(s.km ?? 0)} km</span></span>
}

function SuggestionCard({ s, busy, onApply }: { s: Suggestion; busy: boolean; onApply: () => void }) {
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium"><Lightbulb className="h-4 w-4 text-amber-600" />{s.title}</span>
        <button onClick={onApply} disabled={busy}
          className="tap inline-flex items-center gap-1 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50">
          Übernehmen <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="mt-1.5 grid gap-0.5 text-xs text-muted-foreground">{s.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {s.diff.map((r) => (
          <li key={r.date} className="grid gap-1 sm:grid-cols-[4.5rem_1fr_auto_1fr] sm:items-center sm:gap-2">
            <span className="text-xs font-medium tabular-nums">{day(r.date)}</span>
            <span className="min-w-0 text-muted-foreground line-through decoration-muted-foreground/40"><SessionCell s={r.before} /></span>
            <ArrowRight className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            <SessionCell s={r.after} />
          </li>
        ))}
      </ul>
      {s.weekKm.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          Woche danach: {s.weekKm.map((w) => `ab ${day(w.start)} ${fmtKm(w.before)} → ${fmtKm(w.after)} km`).join(' · ')}
        </p>
      )}
    </li>
  )
}
