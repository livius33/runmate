'use client'

// Neuer Plan (07-06): pick a main race and a template, check the inputs measured from the runs and the plan, review the
// generated draft week by week and day by day, save it. Nothing goes live from here (07-14).
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Power, RotateCcw, SlidersHorizontal, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, Pill, Stat, TypeTag } from '@/components/plan/ui'
import { clockText, parseClock, type SeasonGoal } from '@/lib/season/goals'
import type { Draft, DraftOverrides, DraftResult } from '@/lib/plan/generator/draft'
import type { StoredDraft } from '@/lib/plan/draft-store'
import type { PlanSession } from '@/lib/plan/types'
import { Upsell, useEntitlements } from '@/components/billing/Entitlements'

type TField = { path: string; label: string; group: string; kind: 'int' | 'share' | 'number' | 'bool' | 'choice'; min: number; max: number; unit?: string; hint?: string
  options?: { value: string; label: string }[]; template: number | boolean | string }
type Template = { id: string; name: string; summary: string; distances: string[]; tuning: Record<string, number | boolean | string>
  keys: { runs: number; keyBuild: number; recoveryEvery: number; taperWeeks: number | null; longShare: number; raceInLong: boolean }; fields: TField[]
  own?: { name: string; compare: { id: string; name: string; values: Record<string, number | boolean | string | null> }[] } }
type Live = { id: string; draftId: string; goalId: string; liveAt: string; planStart: string; end: string; name: string }
type Ctx = { goals: SeasonGoal[]; templates: Template[]; defaultStart: string; profile: boolean; drafts: { draft: StoredDraft; result: DraftResult }[]; live: Live[] }
type Field = 'currentKm' | 'provenKm' | 'longest30Km' | 'peakKm' | 'goalS'

const DISTANCE: Record<string, string> = { marathon: 'marathon', half: 'half', '10k': '10k' }
const SOURCE: Record<string, string> = { mean4: 'Schnitt der letzten 4 Wochen', recoveryBlock: 'letzte Woche deines Erholungsblocks', plan: 'geplante Woche vor dem Start', manual: 'von dir gesetzt' }
const PHASE: Record<string, string> = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Taper' }
const longDate = (d: string) => format(parseISO(d), 'EEEEEE. d. MMMM yyyy', { locale: de })
const dayLabel = (d: string) => format(parseISO(d), 'EEEEEE d.M.', { locale: de })
const km = (n: number | null | undefined) => (n == null ? '–' : String(Math.round(n * 10) / 10).replace('.', ','))
const fmtPace = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`
// A field value as shown in the editor and the comparison (shares in %, decimals with a comma).
const showValue = (f: TField, v: number | boolean | string | null | undefined) => v == null ? '–' : typeof v === 'boolean' ? (v ? 'ja' : 'nein')
  : f.kind === 'choice' ? f.options?.find((o) => o.value === v)?.label ?? String(v)
  : f.kind === 'share' ? `${String(Math.round((v as number) * 1000) / 10).replace('.', ',')} %` : String(v).replace('.', ',')

export default function NewPlanPage() {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">Lädt…</p>}><NewPlan /></Suspense>
}

function NewPlan() {
  const qc = useQueryClient()
  const { features } = useEntitlements()
  const params = useSearchParams()
  const ctx = useQuery<Ctx>({ queryKey: ['drafts'], queryFn: () => fetch('/api/running/drafts').then((r) => r.json()) })
  const [goalId, setGoalId] = useState(params.get('goal') ?? '')
  const [templateId, setTemplateId] = useState('')
  const [start, setStart] = useState('')
  const [text, setText] = useState<Partial<Record<Field, string>>>({})
  const [draftId, setDraftId] = useState<string | undefined>()
  const [note, setNote] = useState<string | null>(null)

  const goal = ctx.data?.goals.find((g) => g.id === goalId)
  const fitting = (ctx.data?.templates ?? []).filter((t) => goal && t.distances.includes(DISTANCE[goal.kind] ?? ''))
    .sort((a, b) => Number(!!a.own) - Number(!!b.own))
  // ?draft=<id> (from the Plan page or Saison) opens that saved draft.
  const wanted = params.get('draft')
  useEffect(() => { const d = ctx.data?.drafts.find((x) => x.draft.id === wanted); if (d && !draftId) load(d.draft) }, [ctx.data, wanted]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!goalId && ctx.data?.goals[0]) setGoalId(ctx.data.goals[0].id) }, [ctx.data, goalId])
  useEffect(() => { if (ctx.data && !start) setStart(ctx.data.defaultStart) }, [ctx.data, start])
  useEffect(() => { if (fitting.length && !fitting.some((t) => t.id === templateId)) setTemplateId(fitting[0].id) }, [fitting, templateId])

  const overrides: DraftOverrides = {}
  for (const f of ['currentKm', 'provenKm', 'longest30Km', 'peakKm'] as const) {
    const v = text[f]?.trim().replace(',', '.')
    if (v) overrides[f] = Number(v)
  }
  if (text.goalS?.trim()) overrides.goalS = parseClock(text.goalS) ?? NaN
  // "Mein Ansatz": edited values per field (text as typed; booleans as is), previewed before they are saved.
  const template = ctx.data?.templates.find((t) => t.id === templateId)
  const [tune, setTune] = useState<Record<string, string | boolean>>({})
  const [tuneOpen, setTuneOpen] = useState(false)
  const [ownName, setOwnName] = useState('')
  const [compareId, setCompareId] = useState('')
  useEffect(() => {
    if (!template) return
    if (template.own) { setTuneOpen(true); setOwnName(template.own.name); setCompareId((c) => c || template.own!.compare[0]?.id || '') }
    setTune(Object.fromEntries(Object.entries(template.tuning).map(([k, v]) => {
      const f = template.fields.find((x) => x.path === k)
      return [k, typeof v === 'boolean' ? v : f?.kind === 'choice' ? String(v) : f?.kind === 'share' ? String(Math.round((v as number) * 1000) / 10).replace('.', ',') : String(v).replace('.', ',')]
    })))
  }, [template?.id, template?.tuning]) // eslint-disable-line react-hooks/exhaustive-deps
  const tuning: Record<string, number | boolean | string> = {}
  for (const [k, v] of Object.entries(tune)) {
    const f = template?.fields.find((x) => x.path === k)
    if (!f) continue
    if (typeof v === 'boolean' || f.kind === 'choice') tuning[k] = v
    else if (v.trim()) { const n = Number(v.trim().replace(',', '.')); tuning[k] = f.kind === 'share' ? n / 100 : n }
  }
  const tuneDirty = JSON.stringify(tuning) !== JSON.stringify(template?.tuning ?? {}) || (!!template?.own && ownName.trim() !== template.own.name)
  const choice = { goalId, templateId, start, overrides, tuning }
  const ready = !!goalId && !!templateId && !!start
  const preview = useQuery<DraftResult>({
    queryKey: ['draft-preview', choice],
    queryFn: () => fetch('/api/running/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(choice) }).then((r) => r.json()),
    enabled: ready,
    placeholderData: (prev) => prev,
  })
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/running/drafts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: { ...choice, id: draftId } }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Speichern fehlgeschlagen')
      return d.draft as StoredDraft
    },
    onSuccess: (d) => { setDraftId(d.id); setNote('Entwurf gespeichert. Er rechnet sich bei jedem Öffnen mit deinen aktuellen Läufen neu.'); qc.invalidateQueries({ queryKey: ['drafts'] }); qc.invalidateQueries({ queryKey: ['plan-status'] }) },
  })

  // Going live saves the current choices first, so the frozen plan is exactly the preview on screen.
  const [confirm, setConfirm] = useState<'live' | 'offline' | null>(null)
  const post = async (body: unknown) => {
    const r = await fetch('/api/running/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Fehlgeschlagen')
    return d
  }
  const saveTune = useMutation({
    mutationFn: () => post(template?.own ? { action: 'own', templateId, tuning, name: ownName } : { action: 'tune', templateId, tuning }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['drafts'] }) },
  })
  const live = useMutation({
    mutationFn: async () => {
      if (tuneDirty) await saveTune.mutateAsync()
      return post({ action: 'live', draftId: (await save.mutateAsync()).id })
    },
    onSuccess: () => window.location.reload(),
  })
  const offline = useMutation({
    mutationFn: (blockId: string) => post({ action: 'offline', blockId }),
    onSuccess: () => window.location.reload(),
  })

  const load = (d: StoredDraft) => {
    setDraftId(d.id); setGoalId(d.goalId); setTemplateId(d.templateId); setStart(d.start); setNote(null)
    setText(Object.fromEntries(Object.entries(d.overrides).map(([k, v]) => [k, k === 'goalS' ? clockText(v as number) : String(v).replace('.', ',')])))
  }

  if (ctx.isLoading) return <p className="text-sm text-muted-foreground">Lädt…</p>
  if (ctx.isError || !ctx.data) return <p className="text-sm text-brand">Konnte nicht geladen werden. Seite neu laden.</p>
  const r = preview.data
  const draft = r?.ok ? (r as Draft) : null

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <Link href="/season" className="text-xs text-muted-foreground hover:text-foreground">← Saison</Link>
        <h1 className="mt-1 text-2xl sm:text-[28px] font-semibold tracking-tight">Neuer Plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entwurf aus einer Vorlage und deinen Läufen. Dein laufender Plan ändert sich dadurch nicht.</p>
      </div>

      {ctx.data.drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs text-muted-foreground">Gespeichert:</span>
          {ctx.data.drafts.map(({ draft: d, result }) => {
            const g = ctx.data!.goals.find((x) => x.id === d.goalId)
            return (
              <button key={d.id} onClick={() => load(d)} aria-pressed={d.id === draftId}
                className={cn('tap rounded-full border px-3 py-1 text-xs', d.id === draftId ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-secondary')}>
                {g?.name ?? 'Ziel gelöscht'} · {ctx.data!.templates.find((t) => t.id === d.templateId)?.name ?? d.templateId}{!result.ok && ' ⚠'}
              </button>
            )
          })}
        </div>
      )}

      {ctx.data.goals.length === 0 ? (
        <Card><p className="text-sm">Kein kommendes Hauptrennen. Lege es auf der <Link href="/season" className="text-brand hover:underline">Saison-Seite</Link> an.</p></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Rennen und Vorlage">
            <div className="grid gap-4 text-sm">
              <label className="grid gap-1">
                <span className="text-muted-foreground">Rennen</span>
                <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2">
                  {ctx.data.goals.map((g) => <option key={g.id} value={g.id}>{g.name} · {longDate(g.date)}{g.goalS ? ` · Ziel ${clockText(g.goalS)}` : ''}{g.confirmed ? '' : ' (Datum offen)'}</option>)}
                </select>
              </label>
              <div className="grid gap-1.5">
                <span className="text-muted-foreground">Vorlage</span>
                {fitting.length === 0 && <p className="text-xs text-brand">Für dieses Rennen gibt es noch keine Vorlage.</p>}
                {fitting.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTemplateId(t.id)} aria-pressed={t.id === templateId}
                    className={cn('rounded-xl border px-3 py-2 text-left', t.id === templateId ? 'border-foreground bg-secondary' : 'border-border hover:border-foreground/40')}>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-medium">{t.name}{t.own?.name ? ` · ${t.own.name}` : ''}</span>
                      {Object.keys(t.tuning).length > 0 && <span className="text-[11px] font-medium text-brand">{t.own ? `${Object.keys(t.tuning).length} eigene Werte` : 'Mein Ansatz'}</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground line-clamp-2">{t.summary}</span>
                    <span className="mt-1 block text-[11px] tabular-nums text-muted-foreground">
                      {t.keys.runs} Läufe · {t.keys.keyBuild} Qualität im Aufbau · Erholung alle {t.keys.recoveryEvery} Wochen
                      {t.keys.taperWeeks ? ` · Taper ${t.keys.taperWeeks} W` : ''} · Longrun ≤ {Math.round(t.keys.longShare * 100)} %{t.keys.raceInLong ? ' mit Renntempo' : ''}
                    </span>
                  </button>
                ))}
              </div>
              <label className="grid gap-1">
                <span className="text-muted-foreground">Start (Montag der Woche)</span>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2" />
              </label>
            </div>
          </Card>

          <Card title="Ausgangswerte" aside={<span className="text-xs text-muted-foreground">leer = gemessen</span>}>
            <div className="grid gap-3 text-sm">
              <Input label="Aktueller Umfang" unit="km/Woche" field="currentKm" text={text} setText={setText} draft={draft}
                hint={draft ? SOURCE[draft.inputs.currentKm.override ? 'manual' : draft.inputs.currentKmSource] : undefined} />
              <Input label="Gehaltener Umfang (52 Wochen)" unit="km/Woche" field="provenKm" text={text} setText={setText} draft={draft} hint="höchster 4-Wochen-Schnitt" />
              <Input label="Längster Lauf (30 Tage vor dem Start)" unit="km" field="longest30Km" text={text} setText={setText} draft={draft} hint="Läufe und geplante Läufe, ohne Rennen" />
              <Input label="Spitze" unit="km/Woche" field="peakKm" text={text} setText={setText} draft={draft} hint={draft ? `Empfehlung ${km(draft.skeleton.peak.recommendedKm)} km` : undefined} />
              <label className="grid gap-1">
                <span className="text-muted-foreground">Zielzeit</span>
                <input value={text.goalS ?? ''} onChange={(e) => setText({ ...text, goalS: e.target.value })} placeholder={goal?.goalS ? clockText(goal.goalS) : 'h:mm:ss'}
                  className="rounded-lg border border-border bg-background px-3 py-2 tabular-nums" />
              </label>
              <p className="text-xs text-muted-foreground">
                Letztes Rennen: {draft?.inputs.recentRace ? `${km(draft.inputs.recentRace.distanceKm)} km in ${clockText(draft.inputs.recentRace.timeS)} (${dayLabel(draft.inputs.recentRace.date)})` : 'keins in den letzten 6 Monaten'}
                {!ctx.data.profile && <> · <Link href="/plan/anpassen" className="text-brand hover:underline">Trainingsprofil</Link> fehlt: Standard-Lauftage (Fr Ruhe, Sa Longrun, Di/Do Qualität).</>}
              </p>
            </div>
          </Card>
        </div>
      )}

      {template && (
        <Card title={template.own ? 'Eigene Methode' : `Mein Ansatz · ${template.name}`} aside={
          <button onClick={() => setTuneOpen(!tuneOpen)} className="tap inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary">
            <SlidersHorizontal className="h-3.5 w-3.5" /> {tuneOpen ? 'Schließen' : Object.keys(tuning).length ? `${Object.keys(tuning).length} eigene Werte` : 'Werte anpassen'}
          </button>}>
          {!tuneOpen ? (
            template.own ? <p className="text-sm text-muted-foreground">Neutrale Grundlage aus den Recherchen. Jeder Wert lässt sich setzen; die Sicherheitsgrenzen gelten immer.</p> :
            <p className="text-sm text-muted-foreground">Die Vorlage bestimmt Läufe, Schlüsseleinheiten, Longrun, Erholung, Spitze und Taper. Hier setzt du eigene Werte;
              die Sicherheitsgrenzen gelten immer.</p>
          ) : (
            <div className="grid gap-4">
              {template.own && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Name deiner Methode</span>
                    <input value={ownName} maxLength={60} onChange={(e) => setOwnName(e.target.value)} placeholder="Eigene Methode"
                      className="rounded-lg border border-border bg-background px-3 py-2" />
                  </label>
                  <p className="self-end text-xs text-muted-foreground">Startpunkt: neutrale Werte aus den Recherchen, keine Buchmethode. Leere Felder = Grundlage.
                    Geprüft wird wie bei jeder Vorlage.</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...new Set(template.fields.map((f) => f.group))].map((g) => (
                  <div key={g} className="grid content-start gap-2.5 rounded-xl bg-secondary/40 p-3">
                    <span className="text-xs font-medium text-muted-foreground">{g}</span>
                    {template.fields.filter((f) => f.group === g).map((f) => <TuneInput key={f.path} f={f} value={tune[f.path]}
                      paceS={f.path.startsWith('paces.offsets.') && draft ? draft.paces.racePaceS : undefined} onChange={(v) => setTune((t) => {
                      const next = { ...t }
                      if (v === undefined) delete next[f.path]; else next[f.path] = v
                      return next
                    })} />)}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => saveTune.mutate()} disabled={!tuneDirty || saveTune.isPending}
                  className="tap inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-40">
                  <Check className="h-3.5 w-3.5" /> {saveTune.isPending ? 'Speichert…' : template.own ? 'Methode speichern' : 'Ansatz speichern'}
                </button>
                <button onClick={() => setTune({})} disabled={!Object.keys(tune).length}
                  className="tap inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-40">
                  <RotateCcw className="h-3.5 w-3.5" /> {template.own ? 'Alles wie die Grundlage' : 'Alles wie in der Vorlage'}
                </button>
                <span className="text-xs text-muted-foreground">{tuneDirty ? 'Vorschau rechnet schon mit deinen Werten, gespeichert ist noch nichts.' : saveTune.isSuccess ? `Gespeichert: gilt für jeden Entwurf mit ${template.own ? 'deiner Methode' : 'dieser Vorlage'}.` : ''}</span>
                {saveTune.isError && <span className="text-xs text-brand">{(saveTune.error as Error).message}</span>}
              </div>
              {template.own && !features.ownMethod && <Upsell feature="ownMethod" />}
              {template.own && template.own.compare.length > 0 && <Compare t={template} tuning={tuning} id={compareId} setId={setCompareId} />}
            </div>
          )}
        </Card>
      )}

      {preview.isFetching && !r && <p className="text-sm text-muted-foreground">Rechnet…</p>}
      {r && !r.ok && <p className="flex items-center gap-1.5 text-sm text-brand"><AlertTriangle className="h-4 w-4" />{(r as { error: string }).error}</p>}
      {draft && <Review d={draft} stale={preview.isFetching} />}

      {draft && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => save.mutate()} disabled={save.isPending}
            className="tap inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            <Check className="h-4 w-4" /> {save.isPending ? 'Speichert…' : draftId ? 'Entwurf aktualisieren' : 'Entwurf speichern'}
          </button>
          {note && <span className="text-sm text-teal">{note}</span>}
          {save.isError && <span className="text-sm text-brand">{(save.error as Error).message}</span>}
        </div>
      )}

      {draft && goal && (() => {
        const current = ctx.data!.live.find((l) => l.goalId === goal.id)
        const busy = live.isPending || offline.isPending
        const error = (live.error ?? offline.error) as Error | null
        return (
          <Card title="Live schalten" aside={current ? <Pill className="border-teal/30 bg-teal-soft text-teal">live seit {dayLabel(current.liveAt.slice(0, 10))}</Pill> : undefined}>
            {current ? (
              <div className="grid gap-3 text-sm">
                <p>Dein laufender Plan für {current.name}: {longDate(current.planStart)} bis {longDate(current.end)}. Er bleibt so, auch wenn du diesen Entwurf änderst.</p>
                {confirm === 'offline' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand">Offline nehmen? Ab {dayLabel(current.planStart)} ist dann kein Plan mehr da.</span>
                    <button onClick={() => offline.mutate(current.id)} disabled={busy} className="tap rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Ja, offline nehmen</button>
                    <button onClick={() => setConfirm(null)} className="tap rounded-lg border border-border px-3 py-1.5 text-xs">Abbrechen</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirm('offline')} className="tap inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary"><Power className="h-3.5 w-3.5" /> Offline nehmen</button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 text-sm">
                <p>Ab {longDate(draft.skeleton.weeks[0].start)} wird dieser Entwurf dein laufender Plan: Plan-Seite, Heute, Kalender und Engine lesen ihn dann.
                  Bis dahin bleibt alles, wie es ist. Danach ändert er sich nicht mehr mit Vorlage oder Profil.</p>
                {confirm === 'live' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Speichern und live schalten?</span>
                    <button onClick={() => live.mutate()} disabled={busy} className="tap rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{busy ? 'Schaltet…' : 'Ja, live schalten'}</button>
                    <button onClick={() => setConfirm(null)} className="tap rounded-lg border border-border px-3 py-1.5 text-xs">Abbrechen</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirm('live')} className="tap inline-flex w-fit items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background"><Power className="h-3.5 w-3.5" /> Live schalten</button>
                )}
              </div>
            )}
            {error && <p className="mt-2 text-sm text-brand">{error.message}</p>}
          </Card>
        )
      })()}
    </div>
  )
}

// "Vergleich mit …" (07-19): the own method's values next to a book method's, only where they differ.
function Compare({ t, tuning, id, setId }: { t: Template; tuning: Record<string, number | boolean | string>; id: string; setId: (id: string) => void }) {
  const other = t.own!.compare.find((c) => c.id === id) ?? t.own!.compare[0]
  const rows = t.fields.map((f) => ({ f, mine: tuning[f.path] ?? f.template, theirs: other.values[f.path] }))
    .filter((r) => r.theirs != null && r.mine !== r.theirs)
  return (
    <div className="grid gap-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Vergleich mit</span>
        <select value={other.id} onChange={(e) => setId(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
          {t.own!.compare.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{rows.length ? `${rows.length} Werte anders` : 'gleiche Werte'}</span>
      </div>
      {rows.length > 0 && (
        <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ f, mine, theirs }) => (
            <div key={f.path} className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1">
              <span className="min-w-0 truncate text-muted-foreground" title={`${f.group} · ${f.label}`}>{f.group === 'Einheiten' || f.group === 'Intensität' || f.group === 'Tempo' ? f.label : `${f.group}: ${f.label}`}</span>
              <span className="shrink-0 tabular-nums"><span className="font-medium">{showValue(f, mine)}</span> <span className="text-muted-foreground">· {showValue(f, theirs)}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TuneInput({ f, value, onChange, paceS }: { f: TField; value: string | boolean | undefined; onChange: (v: string | boolean | undefined) => void; paceS?: number }) {
  const own = value !== undefined && value !== ''
  const shown = (v: number) => (f.kind === 'share' ? String(Math.round(v * 1000) / 10) : String(v)).replace('.', ',')
  if (f.kind === 'choice') {
    const cur = typeof value === 'string' ? value : (f.template as string)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0">{f.label}</span>
        <span className="flex items-center gap-1">
          {f.options!.map((o) => (
            <button key={o.value} type="button" aria-pressed={cur === o.value} onClick={() => onChange(o.value === f.template ? undefined : o.value)}
              className={cn('tap rounded-md border px-2 py-0.5 text-xs', cur === o.value ? (own ? 'border-brand bg-brand-soft text-brand' : 'border-foreground bg-foreground text-background') : 'border-border')}>{o.label}</button>
          ))}
        </span>
      </div>
    )
  }
  if (f.kind === 'bool') {
    const cur = typeof value === 'boolean' ? value : (f.template as boolean)
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0">{f.label}</span>
        <span className="flex items-center gap-1">
          {(['ja', 'nein'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={cur === (l === 'ja')} onClick={() => onChange((l === 'ja') === f.template ? undefined : l === 'ja')}
              className={cn('tap rounded-md border px-2 py-0.5 text-xs', cur === (l === 'ja') ? (own ? 'border-brand bg-brand-soft text-brand' : 'border-foreground bg-foreground text-background') : 'border-border')}>{l}</button>
          ))}
        </span>
      </div>
    )
  }
  return (
    <label className="grid gap-1 text-sm">
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0">{f.label}</span>
        {own && <button type="button" onClick={() => onChange(undefined)} className="text-[11px] text-muted-foreground hover:text-foreground">Vorlage {shown(f.template as number)}</button>}
      </span>
      <span className="flex items-center gap-2">
        <input inputMode="decimal" value={typeof value === 'string' ? value : ''} placeholder={shown(f.template as number)} onChange={(e) => onChange(e.target.value)}
          className={cn('w-full rounded-lg border bg-background px-2.5 py-1.5 tabular-nums', own ? 'border-brand' : 'border-border')} />
        {f.unit && <span className="shrink-0 text-xs text-muted-foreground">{f.unit}</span>}
      </span>
      {(f.hint || paceS) && <span className="text-[11px] text-muted-foreground">{[f.hint, paceS ? `= ${fmtPace(paceS + (own ? Number(String(value).replace(',', '.')) || 0 : f.template as number))}/km beim Ziel` : null].filter(Boolean).join(' · ')}</span>}
    </label>
  )
}

function Input({ label, unit, field, text, setText, draft, hint }: {
  label: string; unit: string; field: Field; text: Partial<Record<Field, string>>; setText: (t: Partial<Record<Field, string>>) => void; draft: Draft | null; hint?: string
}) {
  const measured = draft?.inputs[field].measured
  return (
    <label className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input inputMode="decimal" value={text[field] ?? ''} onChange={(e) => setText({ ...text, [field]: e.target.value })}
          placeholder={measured != null ? km(measured) : '–'} className="w-full rounded-lg border border-border bg-background px-3 py-2 tabular-nums" />
        <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
      </span>
      {hint && <span className="text-xs text-muted-foreground">{text[field]?.trim() ? 'von dir gesetzt' : hint}</span>}
    </label>
  )
}

function Review({ d, stale }: { d: Draft; stale: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const sessions = [...d.workouts.sessions, ...(d.recovery?.sessions ?? [])]   // incl. the recovery weeks after the race (07-22)
  const tests = sessions.filter((s) => s.test)
  return (
    <div className={cn('flex flex-col gap-5 transition-opacity', stale && 'opacity-60')}>
      <Card title="Entwurf">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Wochen" value={d.skeleton.weeks.length} />
          <Stat label="Spitze" value={km(d.skeleton.peakKm)} unit="km" />
          <Stat label="Renntempo" value={d.paces.fmt[d.distance === 'marathon' ? 'marathon_pace' : d.distance === 'half' ? 'half_marathon_pace' : 'threshold']} unit="/km" />
          <Stat label="Tests" value={tests.length ? tests.map((s) => dayLabel(s.date)).join(', ') : '–'} />
        </div>
        <div className="mt-4 grid gap-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Warum diese Spitze</span>
          {d.skeleton.peak.why.map((line, i) => <p key={i} className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{line}</p>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(['easy', 'long', 'threshold', 'intervals_vo2', 'half_marathon_pace', 'marathon_pace'] as const).map((p) => (
            <Pill key={p}>{{ easy: 'Locker', long: 'Longrun', threshold: 'Schwelle', intervals_vo2: 'VO2max', half_marathon_pace: 'HM-Tempo', marathon_pace: 'M-Tempo' }[p]} {d.paces.fmt[p]}</Pill>
          ))}
        </div>
      </Card>

      {d.warnings.length > 0 && (
        <Card title="Hinweise" aside={<span className="text-xs text-muted-foreground">{d.warnings.length}</span>}>
          <ul className="grid gap-1.5 text-sm">
            {d.warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span><span className="text-muted-foreground">{w.step}: </span>{w.text}</span></li>)}
          </ul>
        </Card>
      )}

      <Card title="Wochen">
        <div className="grid gap-1">
          {[...d.days.weeks, ...(d.recovery?.weeks ?? [])].map((w, i) => {
            const sk = d.skeleton.weeks[i] as (typeof d.skeleton.weeks)[number] | undefined
            const days = sessions.filter((s) => s.date >= w.start && s.date <= w.end)
            const isOpen = open === w.start
            return (
              <div key={w.start} className="border-t border-border first:border-t-0">
                <button onClick={() => setOpen(isOpen ? null : w.start)} className="tap flex w-full items-center gap-2 py-2 text-left text-sm">
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="w-14 shrink-0 tabular-nums font-medium">KW {w.kw}</span>
                  <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{dayLabel(w.start)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{sk ? <>{PHASE[sk.phase]}{w.focus.includes('·') ? ` · ${w.focus.split(' · ').slice(1).join(' · ')}` : ''}</> : w.focus.replace(/ \([^)]*\)$/, '')}</span>
                  <span className="shrink-0 tabular-nums">{km(w.km)} km</span>
                </button>
                {isOpen && (
                  <ul className="grid gap-2 pb-3 pl-6 text-sm">
                    {days.map((s) => <DayRow key={s.date} s={s} />)}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function DayRow({ s }: { s: PlanSession }) {
  return (
    <li className="grid gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <span className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground">{dayLabel(s.date)}</span>
        <TypeTag type={s.type} />
        {s.type !== 'rest' && <span className="tabular-nums">{km(s.km)} km</span>}
        {s.key && <Star className="h-3.5 w-3.5 text-amber-600" aria-label="Schlüsseleinheit" />}
        {s.test && <Pill className="border-brand text-brand">{s.test}</Pill>}
      </span>
      {s.notes && s.type !== 'rest' && <span className="pl-16 text-xs text-muted-foreground">{s.notes}</span>}
    </li>
  )
}
