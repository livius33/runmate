'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Check, History, Lightbulb, RotateCcw, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Card, ChipButton, Input, Inset } from '@/components/ui'
import { TypeTag } from '@/components/plan/tags'
import { RebuildArea, RebuildHistoryRow, rebuildPost, useAfterRebuild, useRebuildState, type RebuildHistoryItem } from '@/components/plan/Rebuild'
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

// Plan anpassen: on top the whole plan (goal, race, everyday, interruption: preview, reasons, apply; components/plan/
// Rebuild.tsx), below the period check with rule-based suggestions (with diff). One history for both, each with undo.
export default function WorkshopPage() {
  const qc = useQueryClient()
  const today = useToday()
  const [choice, setChoice] = useState<Choice>({ p: 'event' })
  const [range, setRange] = useState({ from: '', to: '' })
  // null = workshop; 'overview' = all profile answers; a number = edit that onboarding step alone
  const [profileView, setProfileView] = useState<null | 'overview' | number>(null)
  const [note, setNote] = useState<string | null>(null)
  const [blockId, setBlockId] = useState<string | undefined>(undefined)
  const afterRebuild = useAfterRebuild()

  const prof = useQuery<ProfileData>({ queryKey: ['athlete-profile'], queryFn: () => fetch('/api/running/profile').then((r) => r.json()) })
  const ready = choice.p !== 'range' || (choice.from && choice.to)
  const { data, isLoading, isError } = useQuery<Data>({
    queryKey: ['workshop', choice],
    queryFn: () => fetch(`/api/running/workshop?${qs(choice)}`).then((r) => { if (!r.ok) throw new Error(); return r.json() }),
    enabled: !!ready && !!prof.data?.profile,
  })
  const rebuild = useRebuildState(blockId)
  const refresh = () => ['workshop', 'plan-overrides', 'plan-engine', 'plan-actuals', 'plan-rebuild'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))

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

  const undoRebuild = useMutation({
    mutationFn: (id: string) => rebuildPost({ action: 'undo', id }),
    onSuccess: () => { setNote('Neuaufbau zurückgenommen: der Plan ist wieder wie davor.'); afterRebuild() },
  })

  if (prof.isLoading) return <p className="text-body-sm text-muted-foreground">Lädt…</p>
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

  const error = [apply, undo, undoRebuild].find((m) => m.isError)?.error as Error | undefined
  // Layout (12-02): title, rebuild area and the period overview span the full width; suggestions and history sit in
  // two independent columns from lg up, each card at its natural height.
  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Title row: from sm up the action sits on the title's baseline; on phones it follows the intro line. */}
      <div>
        <Link href="/plan" className="tap text-caption text-muted-foreground hover:text-foreground">← Plan</Link>
        <div className="mt-1 grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
          <h1 className="min-w-0 text-title">Plan anpassen</h1>
          <p className="text-body-sm text-muted-foreground sm:col-start-1">Den ganzen Plan ändern oder einzelne Vorschläge übernehmen. Du siehst vorher, was sich ändert und warum; nichts passiert ohne dich.</p>
          <Button size="action" className="mt-2 justify-self-start sm:col-start-2 sm:row-start-1 sm:mt-0" onClick={() => setProfileView('overview')}>
            <Settings2 /> Trainingsprofil
          </Button>
        </div>
      </div>

      {note && <p className="flex items-center gap-1.5 text-body-sm text-teal-text"><Check className="h-4 w-4 shrink-0" />{note}</p>}
      {error && <p className="flex items-center gap-1.5 text-body-sm text-error"><AlertTriangle className="h-4 w-4 shrink-0" />{error.message}</p>}
      {rebuild.data && <RebuildArea state={rebuild.data} today={today} onBlock={setBlockId} onNote={setNote} />}
      {rebuild.isError && <p className="text-body-sm text-error">Der Planstand konnte nicht geladen werden. Seite neu laden.</p>}

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title-sm">Vorschläge und Verlauf</h2>
          <p className="mt-0.5 text-body-sm text-muted-foreground">Zeitraum wählen und prüfen. Vorschläge ändern einzelne Tage, der Rest des Plans bleibt.</p>
        </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zeitraum">
            {CHOICES.map((c) => (
              <ChipButton key={c.p} selected={choice.p === c.p}
                onClick={() => setChoice(c.p === 'range' ? { p: 'range', from: range.from || undefined, to: range.to || undefined } : { p: c.p })}>
                {c.label}
              </ChipButton>
            ))}
            {choice.p === 'range' && (
              <span className="flex flex-wrap items-center gap-1.5 text-body-sm text-foreground">
                <Input small type="date" value={range.from} onChange={(e) => { const r = { ...range, from: e.target.value }; setRange(r); setChoice({ p: 'range', from: r.from || undefined, to: r.to || undefined }) }} className="w-auto" aria-label="Von" />
                –
                <Input small type="date" value={range.to} onChange={(e) => { const r = { ...range, to: e.target.value }; setRange(r); setChoice({ p: 'range', from: r.from || undefined, to: r.to || undefined }) }} className="w-auto" aria-label="Bis" />
              </span>
            )}
          </div>
      </div>

      {!ready && <p className="text-body-sm text-muted-foreground">Start- und Enddatum wählen.</p>}
      {isLoading && ready && <p className="text-body-sm text-muted-foreground">Rechnet…</p>}
      {isError && <p className="text-body-sm text-error">Konnte nicht geladen werden. Seite neu laden.</p>}

      {data && (
        <>
          <Overview d={data} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card title="Vorschläge" aside={<span>{data.period.label}</span>}>
            {data.hints?.length > 0 && (
              <ul className="mb-4 grid gap-2 text-body-sm" aria-label="Aus deinem Feedback">
                {data.hints.map((h) => (
                  <li key={h.kind} className={cn('rounded-card px-3.5 py-2.5', h.tone === 'warn' ? 'bg-warning-soft text-warning' : 'bg-teal-soft')}>
                    <span className="flex items-start gap-2">
                      {h.tone === 'warn' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />}
                      <span>{h.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.suggestions.length === 0 ? (
              <p className="flex items-start gap-2 text-body-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                Nichts zu ändern: Umfang, Form und Schlüsseleinheiten passen in diesem Zeitraum.</p>
            ) : (
              <ul className="grid gap-4">
                {data.suggestions.map((s) => <SuggestionCard key={s.id} s={s} busy={apply.isPending} onApply={() => apply.mutate(s.id)} />)}
              </ul>
            )}
          </Card>
          <Card title="Verlauf" aside={<History className="h-4 w-4" />}>
            <HistoryList log={data.log} rebuilds={rebuild.data?.history ?? []} busy={undo.isPending || undoRebuild.isPending}
              onUndo={(id) => undo.mutate(id)} onUndoRebuild={(id) => undoRebuild.mutate(id)} />
          </Card>
          </div>
        </>
      )}
    </div>
  )
}

// Rebuilds and taken-over suggestions in one list, newest first.
function HistoryList({ log, rebuilds, busy, onUndo, onUndoRebuild }: { log: WorkshopLogEntry[]; rebuilds: RebuildHistoryItem[]; busy: boolean; onUndo: (id: string) => void; onUndoRebuild: (id: string) => void }) {
  const items = [...rebuilds.map((e) => ({ at: e.at, rebuild: e, entry: null })), ...log.map((e) => ({ at: e.at, rebuild: null, entry: e }))].sort((a, b) => b.at.localeCompare(a.at))
  if (!items.length) return <p className="text-body-sm text-muted-foreground">Noch keine Änderungen über „Plan anpassen“.</p>
  return (
    <ul className="grid gap-2 text-body-sm">
      {items.map(({ rebuild, entry: e }) => rebuild ? <RebuildHistoryRow key={rebuild.id} e={rebuild} busy={busy} onUndo={() => onUndoRebuild(rebuild.id)} /> : e && (
        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
          <span className="min-w-0">
            <span className={cn('font-medium', e.undoneAt && 'text-muted-foreground line-through')}>{e.title}</span>
            <span className="block text-caption tabular-nums text-muted-foreground">{format(parseISO(e.at), 'd.M. HH:mm')} · {e.period} · {Object.keys(e.after).length} Tag(e)</span>
          </span>
          {e.undoneAt ? <span className="text-caption text-muted-foreground">rückgängig</span> : (
            <Button size="sm" onClick={() => onUndo(e.id)} disabled={busy}>
              <RotateCcw /> Rückgängig
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

const de2 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Overview({ d }: { d: Data }) {
  const t = d.review.totals
  const f = d.review.fitness
  const r = d.review.recent
  return (
    <Card title={d.period.label} aside={<span className="tabular-nums">{day(d.period.from)} – {day(d.period.to)}</span>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Geplant" value={`${fmtKm(t.plannedKm)} km`} />
        <Kpi label="Gelaufen" value={`${fmtKm(t.runKm)} km`} />
        <Kpi label="Noch offen" value={`${fmtKm(t.remainingKm)} km`} />
        <Kpi label="Verpasst / extra" value={`${fmtKm(t.missedKm)} / ${fmtKm(t.extraKm)} km`} tone={t.missedKm >= 5 ? 'warn' : undefined} />
        <Kpi label="Schlüsseleinheiten" value={`${d.review.key.done} gelaufen · ${d.review.key.open} offen`} sub={d.review.key.missed ? `${d.review.key.missed} verpasst` : undefined} tone={d.review.key.missed ? 'warn' : undefined} />
        <Kpi label="Form (TSB)" value={f.tsb == null ? '–' : String(Math.round(f.tsb)).replace('-', '−')} tone={f.tsb != null && f.tsb < -25 ? 'warn' : undefined} />
        <Kpi label="ACWR" value={f.acwr == null ? '–' : de2(f.acwr)} tone={f.acwr != null && f.acwr > 1.5 ? 'warn' : undefined} />
        <Kpi label={`Letzte ${r?.weeks ?? 3} Wochen`} value={r ? `${Math.round(r.ratio * 100)} % vom Plan` : '–'} sub={r ? `${fmtKm(r.runKm)} von ${fmtKm(r.plannedKm)} km` : undefined} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-body-sm tabular-nums">
          <thead><tr className="text-left text-caption text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">Woche</th><th className="py-1.5 pr-3 text-right font-medium">Ziel</th>
            <th className="py-1.5 pr-3 text-right font-medium">Geplant</th><th className="py-1.5 pr-3 text-right font-medium">Gelaufen</th>
            <th className="py-1.5 text-right font-medium">Offen</th>
          </tr></thead>
          <tbody>
            {d.review.weeks.map((w) => (
              <tr key={w.start} className="border-t border-border">
                <td className="py-1.5 pr-3">{w.kw ? `KW ${w.kw}` : day(w.start)}{w.focus && <span className="ml-1.5 text-caption text-muted-foreground">{w.focus}</span>}</td>
                <td className="py-1.5 pr-3 text-right text-muted-foreground">{w.targetKm != null ? fmtKm(w.targetKm) : '–'}</td>
                <td className="py-1.5 pr-3 text-right">{fmtKm(w.plannedKm)}</td>
                <td className="py-1.5 pr-3 text-right">{fmtKm(w.runKm)}{w.missedKm > 0 && <span className="ml-1 text-caption text-brand-text">−{fmtKm(w.missedKm)}</span>}</td>
                <td className="py-1.5 text-right">{fmtKm(w.remainingKm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// A figure in a quiet inset: values here are short phrases too ("2 gelaufen · 1 offen"), so 14 px, not Figure's 20 px.
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <Inset className="min-w-0">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={cn('text-body-sm font-semibold tabular-nums', tone === 'warn' && 'text-brand-text')}>{value}</div>
      {sub && <div className="text-caption tabular-nums text-muted-foreground">{sub}</div>}
    </Inset>
  )
}

function SessionCell({ s }: { s: PlanSession | null }) {
  if (!s || s.type === 'rest') return <span className="text-muted-foreground">Ruhetag</span>
  return <span className="flex min-w-0 items-center gap-1.5"><TypeTag type={s.type} /><span className="truncate">{s.title}</span><span className="shrink-0 tabular-nums text-muted-foreground">{fmtKm(s.km ?? 0)} km</span></span>
}

function SuggestionCard({ s, busy, onApply }: { s: Suggestion; busy: boolean; onApply: () => void }) {
  return (
    <li className="rounded-card p-3 shadow-hairline">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-medium"><Lightbulb className="h-4 w-4 shrink-0 text-warning" />{s.title}</span>
        <Button size="sm" onClick={onApply} disabled={busy}>
          Übernehmen <ArrowRight />
        </Button>
      </div>
      <ul className="mt-1.5 grid gap-0.5 text-caption text-muted-foreground">{s.why.map((w, i) => <li key={i}>{w}</li>)}</ul>
      <ul className="mt-3 grid gap-1.5 text-body-sm">
        {s.diff.map((r) => (
          <li key={r.date} className="grid gap-1 sm:grid-cols-[4.5rem_1fr_auto_1fr] sm:items-center sm:gap-2">
            <span className="text-caption font-medium tabular-nums">{day(r.date)}</span>
            <span className="min-w-0 text-muted-foreground line-through decoration-muted-foreground/40"><SessionCell s={r.before} /></span>
            <ArrowRight className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            <SessionCell s={r.after} />
          </li>
        ))}
      </ul>
      {s.weekKm.length > 0 && (
        <p className="mt-2 text-caption tabular-nums text-muted-foreground">
          Woche danach: {s.weekKm.map((w) => `ab ${day(w.start)} ${fmtKm(w.before)} → ${fmtKm(w.after)} km`).join(' · ')}
        </p>
      )}
    </li>
  )
}
