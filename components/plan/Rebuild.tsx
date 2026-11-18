'use client'

// Whole-plan changes on „Plan anpassen“ (v1.1 10-03): three levers side by side (Ziel und Rennen, Alltag,
// Unterbrechung), one preview old against new with the reasons, and „Übernehmen“. The past stays, the rest is rebuilt
// from the next Monday (lib/plan/rebuild.ts); the server gates the apply (Plus: `rebuild`), the preview is free.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Check, Eye, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/plan/ui'
import { PauseControl } from '@/components/plan/PauseControl'
import { Upsell } from '@/components/billing/Entitlements'
import { Days, Num, One } from '@/components/plan/workshop/Onboarding'
import { WEEKDAYS, validProfile, type AthleteProfile, type Weekday } from '@/lib/plan/athlete-profile'
import { clockText, parseClock } from '@/lib/season/goals'
import { fmtKm } from '@/lib/plan/format'
import type { DataCheck, Totals, WeekRow } from '@/lib/plan/rebuild'
import type { RebuildPreview, RebuildState } from '@/lib/plan/rebuild-store'

type Live = Extract<RebuildState, { tooLate: unknown }>
export type RebuildHistoryItem = RebuildState['history'][number]
class PlusRequired extends Error {}

const dm = (d: string) => format(parseISO(d), 'EEEEEE d.M.', { locale: de })
const dmy = (d: string) => format(parseISO(d), 'd.M.yyyy')
const field = 'w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:border-foreground/60'

export function useRebuildState(blockId?: string) {
  return useQuery<RebuildState>({
    queryKey: ['plan-rebuild', blockId ?? null],
    queryFn: () => fetch(`/api/running/plan-rebuild${blockId ? `?block=${encodeURIComponent(blockId)}` : ''}`).then((r) => { if (!r.ok) throw new Error(); return r.json() }),
  })
}

export async function rebuildPost<T>(body: unknown): Promise<T> {
  const r = await fetch('/api/running/plan-rebuild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (r.status === 402) throw new PlusRequired(d.error ?? '')
  if (!r.ok) throw new Error(d.error ?? 'Das hat nicht geklappt. Bitte noch einmal versuchen.')
  return d
}

// After a rebuild or its undo the live block is another one: the layout hands the browser the new blocks, every plan
// query reads again.
export function useAfterRebuild() {
  const qc = useQueryClient()
  const router = useRouter()
  return () => { router.refresh(); qc.invalidateQueries() }
}

export function RebuildArea({ state, today, onBlock, onNote }: { state: RebuildState; today: string; onBlock: (id: string) => void; onNote: (text: string) => void }) {
  if (!state.block) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Ganzen Plan ändern" className="lg:col-span-2">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Zielzeit, Renntermin, Methode und Lauftage änderst du hier für einen laufenden Plan aus dem Generator. Im Moment läuft keiner mit einem Rennen vor dir.
          </p>
          <Link href="/plan/neu" className="tap mt-3 inline-flex items-center gap-1 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background">
            Neuen Plan erstellen <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
        <Card title="Unterbrechung">
          <p className="text-sm text-muted-foreground">Krank oder im Urlaub? Trag die Tage ein: die Einheiten fallen aus, der Wiedereinstieg wird geplant.</p>
          <PauseControl today={today} rebuildLink={false} />
        </Card>
      </div>
    )
  }
  // A new server state (after apply, undo or a pause) starts the levers from what is saved.
  const live = state as Live
  return <Levers key={JSON.stringify([live.block, live.profile?.savedAt, live.history[0]?.id, live.history[0]?.status])} state={live} today={today} onBlock={onBlock} onNote={onNote} />
}

function Levers({ state, today, onBlock, onNote }: { state: Live; today: string; onBlock: (id: string) => void; onNote: (text: string) => void }) {
  const { block } = state
  const done = useAfterRebuild()
  const [goal, setGoal] = useState(clockText(block.goalS))
  const [raceDate, setRaceDate] = useState(block.raceDate)
  const [templateId, setTemplateId] = useState(block.templateId ?? '')
  const [peak, setPeak] = useState(block.peakKm == null ? '' : String(block.peakKm).replace('.', ','))
  const [current, setCurrent] = useState('')
  const [profile, setProfile] = useState<AthleteProfile | null>(state.profile)
  const [plus, setPlus] = useState(false)

  const num = (t: string) => (t.trim() ? Number(t.trim().replace(',', '.')) : null)
  const goalS = goal.trim() ? parseClock(goal, block.short) : block.goalS
  const peakKm = num(peak), currentKm = num(current)
  const profileChanged = !!profile && JSON.stringify({ ...profile, savedAt: null }) !== JSON.stringify({ ...state.profile, savedAt: null })
  const changed = [
    goalS !== block.goalS && 'Zielzeit', raceDate !== block.raceDate && 'Renntermin', templateId !== (block.templateId ?? '') && 'Methode',
    peakKm !== block.peakKm && 'Spitze', currentKm != null && 'Grundlage', profileChanged && 'Alltag',
  ].filter(Boolean) as string[]
  const invalid = goalS == null ? `Zielzeit bitte als ${block.short ? 'mm:ss' : 'h:mm:ss'}.`
    : !raceDate ? 'Bitte einen Renntermin wählen.'
    : peakKm != null && !(peakKm >= 10 && peakKm <= 300) ? 'Spitzenumfang: bitte 10–300 km oder leer lassen.'
    : currentKm != null && !(currentKm >= 5 && currentKm <= 300) ? 'Grundlage: bitte 5–300 km oder leer lassen.'
    : profile && !validProfile(profile) ? 'Alltag: bitte die Angaben prüfen (mindestens ein Lauftag).' : null
  const change = {
    blockId: block.id,
    ...(goalS !== block.goalS && goalS != null ? { goalS } : {}),
    ...(raceDate !== block.raceDate ? { raceDate } : {}),
    ...(templateId && templateId !== block.templateId ? { templateId } : {}),
    ...(peakKm !== block.peakKm ? { peakKm } : {}),
    ...(currentKm != null ? { currentKm } : {}),
    ...(profileChanged ? { profile } : {}),
  }

  const preview = useMutation({ mutationFn: () => rebuildPost<RebuildPreview>({ action: 'preview', change }) })
  const apply = useMutation({
    mutationFn: () => rebuildPost<RebuildPreview>({ action: 'apply', change }),
    onSuccess: (d) => { onNote(`Plan ab ${dm(d.cut)} neu aufgebaut. Im Verlauf lässt sich das zurücknehmen.`); done() },
    onError: (e) => { if (e instanceof PlusRequired) setPlus(true) },
  })
  // Any change to a lever makes the shown preview stale.
  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); preview.reset(); apply.reset() }
  const setP = touch(setProfile)
  const toggle = (k: 'availableDays' | 'qualityDays', d: Weekday) => {
    if (!profile) return
    const next = profile[k].includes(d) ? profile[k].filter((x) => x !== d) : [...profile[k], d].sort()
    // The long run needs a day you run on: it moves to the last one left.
    const longRunDay = k === 'availableDays' && profile.longRunDay != null && !next.includes(profile.longRunDay) ? next[next.length - 1] ?? null : profile.longRunDay
    setP({ ...profile, [k]: next, longRunDay })
  }
  const error = invalid ?? (preview.error as Error | null)?.message ?? (apply.error && !(apply.error instanceof PlusRequired) ? (apply.error as Error).message : null)

  return (
    <section className="grid gap-4" aria-label="Ganzen Plan ändern">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Ganzen Plan ändern</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {block.name}: alles bis {dm(block.cut)} bleibt, wie es ist. Ab dann rechnet Runmate den Plan mit deinen Angaben neu.
          </p>
        </div>
        {state.blocks.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">Plan
            <select value={block.id} onChange={(e) => onBlock(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground">
              {state.blocks.map((b) => <option key={b.id} value={b.id}>{b.name} · {dmy(b.raceDate)}</option>)}
            </select>
          </label>
        )}
      </div>

      {state.tooLate && <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{state.tooLate}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Ziel und Rennen">
          <div className="grid gap-3">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-muted-foreground">Zielzeit</span>
                <input className={field} value={goal} placeholder={block.short ? '42:30' : '1:25:00'} inputMode="numeric" onChange={(e) => touch(setGoal)(e.target.value)} />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-muted-foreground">Renntermin</span>
                <input type="date" className={field} value={raceDate} min={today} onChange={(e) => touch(setRaceDate)(e.target.value)} />
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Methode</span>
              <select className={field} value={templateId} onChange={(e) => touch(setTemplateId)(e.target.value)}>
                {!block.templateId && <option value="">Bitte wählen</option>}
                {state.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.locked ? ' (Plus)' : ''}</option>)}
              </select>
              {state.templates.find((t) => t.id === templateId)?.summary && <span className="text-xs text-muted-foreground">{state.templates.find((t) => t.id === templateId)!.summary}</span>}
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Spitzenumfang</span>
              <span className="flex items-center gap-2">
                <input className={field} value={peak} placeholder="empfohlen" inputMode="decimal" onChange={(e) => touch(setPeak)(e.target.value)} />
                <span className="shrink-0 text-xs text-muted-foreground">km/Woche</span>
              </span>
              <span className="text-xs text-muted-foreground">Leer = Runmate wählt die Spitze aus deinem Umfang und der Methode.</span>
            </label>
            <DataLine ok={state.data.goal.state === 'checked'} text={state.data.goal.text} />
          </div>
        </Card>

        <Card title="Alltag">
          {profile && (
            <div className="grid gap-3">
              <Days label="Lauftage" value={profile.availableDays} onToggle={(d) => toggle('availableDays', d)} />
              <div className="grid grid-cols-2 gap-3">
                <One label="Langer Lauf" value={profile.longRunDay} options={profile.availableDays} onChange={(d) => setP({ ...profile, longRunDay: d })} />
                <One label="Fester Ruhetag" value={profile.restDay} options={WEEKDAYS.map((w) => w.d)} onChange={(d) => setP({ ...profile, restDay: d })} allowNone />
              </div>
              <Days label="Tempotage" value={profile.qualityDays} onToggle={(d) => toggle('qualityDays', d)} />
              <div className="grid grid-cols-2 gap-3">
                <Num field="maxKmWeekday" label="Höchstens Mo–Fr" unit="km" value={profile.maxKmWeekday} onChange={(v) => setP({ ...profile, maxKmWeekday: v })} />
                <Num field="maxKmWeekend" label="Höchstens Sa–So" unit="km" value={profile.maxKmWeekend} onChange={(v) => setP({ ...profile, maxKmWeekend: v })} />
              </div>
              <p className="text-xs text-muted-foreground">Ein laufender Plan folgt neuen Angaben erst mit dem Neuaufbau. „Übernehmen“ speichert sie auch im Trainingsprofil.</p>
            </div>
          )}
        </Card>

        <Card title="Unterbrechung">
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Krank oder im Urlaub? Trag die Tage ein: die Einheiten fallen aus, der Wiedereinstieg wird geplant.</p>
            <div className="-mt-3"><PauseControl today={today} rebuildLink={false} /></div>
            {state.pause?.replan && (
              <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
                Nach {state.pause.days} Tagen Pause passt der alte Aufbau nicht mehr. Die Vorschau zeigt den Plan vom Wiedereinstieg aus.
              </p>
            )}
            <div className="grid gap-1.5 border-t border-border pt-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Grundlage für den Neuaufbau</span>
              <p className="text-sm">{state.base.km > 0 ? state.base.text : 'Aus den letzten 2 Wochen gibt es keine Läufe: bitte deinen aktuellen Umfang eintragen.'}</p>
              <label className="flex items-center gap-2 text-sm">
                <input className={cn(field, 'max-w-28')} value={current} placeholder={state.base.km > 0 ? fmtKm(state.base.km) : '–'} inputMode="decimal" aria-label="Eigener Startumfang" onChange={(e) => touch(setCurrent)(e.target.value)} />
                <span className="text-xs text-muted-foreground">km/Woche, nur wenn der Wert nicht stimmt</span>
              </label>
            </div>
            <DataLine ok={state.data.base.state === 'good'} text={state.data.base.text} />
            <DataLine ok={state.data.long.state === 'good'} text={state.data.long.text} />
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => preview.mutate()} disabled={!!invalid || preview.isPending || !!state.tooLate}
          className="tap inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">
          <Eye className="h-4 w-4" /> {preview.isPending ? 'Rechnet…' : 'Vorschau zeigen'}
        </button>
        <span className="text-sm text-muted-foreground">
          {changed.length ? `Geändert: ${changed.join(', ')}.` : 'Nichts geändert: die Vorschau rechnet den Rest mit deinem aktuellen Stand neu.'}
        </span>
      </div>
      {error && <p className="flex items-start gap-1.5 text-sm text-brand"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

      {preview.data && (
        <Preview p={preview.data} locked={!state.canApply || plus} busy={apply.isPending} onApply={() => apply.mutate()} />
      )}
    </section>
  )
}

function DataLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      {ok ? <Check className="mt-px h-3.5 w-3.5 shrink-0 text-teal" /> : <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />}
      <span>{text}</span>
    </p>
  )
}

const TOTALS: { label: string; of: (t: Totals) => string }[] = [
  { label: 'Rennen', of: (t) => dmy(t.raceDate) },
  { label: 'Zielzeit', of: (t) => clockText(t.goalS) },
  { label: 'Renntempo', of: (t) => t.racePace },
  { label: 'Wochen bis zum Rennen', of: (t) => String(t.weeks) },
  { label: 'Spitzenwoche', of: (t) => `${fmtKm(t.peakKm)} km` },
  { label: 'Längster Longrun', of: (t) => `${fmtKm(t.longestKm)} km` },
  { label: 'Taper ab', of: (t) => (t.taperStart ? dm(t.taperStart) : '–') },
  { label: 'Kilometer bis zum Rennen', of: (t) => `${fmtKm(t.restKm)} km` },
]

// Old against new: totals, the weeks as bars and as rows, the reasons, and what leaves with the old plan.
function Preview({ p, locked, busy, onApply }: { p: RebuildPreview; locked: boolean; busy: boolean; onApply: () => void }) {
  const removed = [p.removed.manual && `${p.removed.manual} eigene Änderung${p.removed.manual === 1 ? '' : 'en'}`, p.removed.engine && `${p.removed.engine} automatische Anpassung${p.removed.engine === 1 ? '' : 'en'}`].filter(Boolean)
  return (
    <Card title={`Vorschau: ${p.title}`} aside={<span className="text-xs text-muted-foreground tabular-nums">ab {dm(p.cut)}</span>}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <table className="w-full self-start text-sm tabular-nums">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1.5 pr-3 font-medium" /><th className="py-1.5 pr-3 font-medium">Bisher</th><th className="py-1.5 font-medium">Neu</th></tr></thead>
          <tbody>
            {TOTALS.map((r) => {
              const a = r.of(p.before), b = r.of(p.after)
              return (
                <tr key={r.label} className="border-t border-border">
                  <td className="py-1.5 pr-3 text-muted-foreground">{r.label}</td>
                  <td className={cn('py-1.5 pr-3', a !== b && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{a}</td>
                  <td className={cn('py-1.5', a !== b && 'font-semibold')}>{b}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="grid gap-3 self-start">
          <WeekBars weeks={p.weeks} />
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Warum</h3>
            <ul className="mt-1.5 grid gap-1 text-sm">{p.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
          {p.warnings.length > 0 && (
            <ul className="grid gap-1 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
              {p.warnings.map((w, i) => <li key={i} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>)}
            </ul>
          )}
        </div>
      </div>

      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer text-sm font-medium">Woche für Woche</summary>
        <ul className="mt-2 grid gap-x-8 text-sm tabular-nums lg:grid-cols-2">
          {p.weeks.map((w) => <WeekLine key={w.start} w={w} />)}
        </ul>
      </details>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">
          {!p.changed ? 'Der Plan passt schon zu diesen Angaben: es gibt nichts zu übernehmen.'
            : removed.length ? `${removed.join(' und ')} ab dem ${dm(p.cut)} ${p.removed.manual + p.removed.engine === 1 ? 'entfällt' : 'entfallen'}: sie galten dem alten Plan. Mit „Rückgängig“ im Verlauf kommt alles zurück.`
            : 'Das lässt sich im Verlauf zurücknehmen.'}
        </p>
        {p.changed && !locked && (
          <button type="button" onClick={onApply} disabled={busy} className="tap inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            <Check className="h-4 w-4" /> {busy ? 'Übernimmt…' : 'Übernehmen'}
          </button>
        )}
      </div>
      {p.changed && locked && <Upsell feature="rebuild" className="mt-3" />}
    </Card>
  )
}

// Each week as a pair of bars: the old plan muted, the new one in front.
function WeekBars({ weeks }: { weeks: WeekRow[] }) {
  const max = Math.max(1, ...weeks.flatMap((w) => [w.before?.km ?? 0, w.after?.km ?? 0]))
  const h = (km: number | undefined) => `${Math.max(km ? 4 : 0, Math.round(((km ?? 0) / max) * 100))}%`
  return (
    <div>
      <div className="flex h-24 items-end gap-1 sm:gap-1.5" role="img" aria-label={`Wochenkilometer bisher und neu, ${weeks.length} Wochen`}>
        {weeks.map((w) => (
          <div key={w.start} className="flex h-full min-w-0 flex-1 items-end gap-px" title={`KW ${w.kw}: ${w.before ? `${fmtKm(w.before.km)} km` : '–'} → ${w.after ? `${fmtKm(w.after.km)} km` : '–'}`}>
            <span className="flex-1 rounded-t-sm bg-muted-foreground/25" style={{ height: h(w.before?.km) }} />
            <span className={cn('flex-1 rounded-t-sm', w.after?.kind === 'Taper' ? 'bg-teal' : w.after?.kind === 'Erholung' ? 'bg-foreground/45' : 'bg-foreground')} style={{ height: h(w.after?.km) }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground tabular-nums sm:gap-1.5">
        {weeks.map((w, i) => <span key={w.start} className={cn('min-w-0 flex-1 text-center', weeks.length > 10 && i % 2 === 1 && 'invisible sm:visible')}>{w.kw}</span>)}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-muted-foreground/25" />bisher</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-foreground" />neu</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-foreground/45" />Erholung</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-teal" />Taper</span>
        <span>Kalenderwochen, km pro Woche</span>
      </p>
    </div>
  )
}

function WeekLine({ w }: { w: WeekRow }) {
  const same = !!w.before && !!w.after && w.before.km === w.after.km && w.before.keys.join() === w.after.keys.join()
  return (
    <li className="grid grid-cols-[3.25rem_3.5rem_minmax(0,1fr)] items-baseline gap-2 border-t border-border py-1.5 first:border-t-0 lg:[&:nth-child(2)]:border-t-0">
      <span className="text-xs text-muted-foreground">KW {w.kw}</span>
      <span className="text-right">
        {w.before && !same && <span className="mr-1 text-xs text-muted-foreground line-through decoration-muted-foreground/40">{fmtKm(w.before.km)}</span>}
        <span className="font-medium">{w.after ? fmtKm(w.after.km) : '–'}</span>
      </span>
      <span className="min-w-0 truncate text-muted-foreground">
        {w.after ? [w.after.kind, ...w.after.keys].join(' · ') : 'nicht mehr im Plan'}
      </span>
    </li>
  )
}

// One rebuild in the page's history.
export function RebuildHistoryRow({ e, busy, onUndo }: { e: RebuildHistoryItem; busy: boolean; onUndo: () => void }) {
  const undone = e.status === 'undone'
  return (
    <li className="border-t border-border pt-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className={cn('font-medium', undone && 'text-muted-foreground line-through')}>{e.title}</span>
          <span className="block text-xs text-muted-foreground">{format(parseISO(e.at), 'd.M. HH:mm')} · Neuaufbau ab {dm(e.cut)} · {fmtKm(e.before.peakKm)} → {fmtKm(e.after.peakKm)} km Spitze</span>
        </span>
        {undone ? <span className="text-xs text-muted-foreground">rückgängig</span> : e.canUndo ? (
          <button onClick={onUndo} disabled={busy} className="tap inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50">
            <RotateCcw className="h-3 w-3" /> Rückgängig
          </button>
        ) : null}
      </div>
      {!undone && (
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Begründung</summary>
          <ul className="mt-1 grid gap-0.5">{e.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </details>
      )}
    </li>
  )
}

export type { DataCheck }
