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
import { Button, Card, Chip, ChipButton, Figure, Inset, Input } from '@/components/ui'
import { TypeTag } from '@/components/plan/tags'
import { fmtKm, fmtPace } from '@/lib/plan/format'
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
const SOURCE: Record<string, string> = { mean4: 'Schnitt der letzten 4 Wochen', recoveryBlock: 'letzte Woche deines Erholungsblocks', plan: 'geplante Woche vor dem Start', manual: 'von dir gesetzt', runs2: 'Schnitt deiner letzten 2 Wochen', return: 'Wiedereinstieg nach der Pause' }
const PHASE: Record<string, string> = { base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Taper' }
const longDate = (d: string) => format(parseISO(d), 'EEEEEE. d. MMMM yyyy', { locale: de })
const dayLabel = (d: string) => format(parseISO(d), 'EEEEEE d.M.', { locale: de })
const km = (n: number | null | undefined) => (n == null ? '–' : fmtKm(n))
// Native selects in the Input look (12-02; there is no Select primitive yet).
const select = 'h-10 w-full min-w-0 rounded-control bg-card px-3 text-body-sm text-foreground shadow-hairline outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring'
// A small segmented toggle inside the tuning groups: ink when it is the template's value, brand when it is your own.
const toggle = (on: boolean, own: boolean) => cn('tap h-7 rounded-control px-2 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  on ? (own ? 'bg-brand-soft text-brand-text ring-1 ring-inset ring-brand' : 'bg-foreground text-background') : 'bg-card text-muted-foreground shadow-hairline hover:text-foreground')
// A field value as shown in the editor and the comparison (shares in %, decimals with a comma).
const showValue = (f: TField, v: number | boolean | string | null | undefined) => v == null ? '–' : typeof v === 'boolean' ? (v ? 'ja' : 'nein')
  : f.kind === 'choice' ? f.options?.find((o) => o.value === v)?.label ?? String(v)
  : f.kind === 'share' ? `${String(Math.round((v as number) * 1000) / 10).replace('.', ',')} %` : String(v).replace('.', ',')

export default function NewPlanPage() {
  return <Suspense fallback={<p className="text-body-sm text-muted-foreground">Lädt…</p>}><NewPlan /></Suspense>
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

  if (ctx.isLoading) return <p className="text-body-sm text-muted-foreground">Lädt…</p>
  if (ctx.isError || !ctx.data) return <p className="text-body-sm text-error">Konnte nicht geladen werden. Seite neu laden.</p>
  const r = preview.data
  const draft = r?.ok ? (r as Draft) : null

  // Layout (12-02): the two input cards side by side from lg up, each at its natural height; tuning, draft and going
  // live span the full width below. The phone order is unchanged.
  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="min-w-0">
        <Link href="/season" className="tap text-caption text-muted-foreground hover:text-foreground">← Saison</Link>
        <h1 className="mt-1 text-title sm:text-display">Neuer Plan</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">Entwurf aus einer Vorlage und deinen Läufen. Dein laufender Plan ändert sich dadurch nicht.</p>
      </div>

      {ctx.data.drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-muted-foreground">Gespeichert:</span>
          {ctx.data.drafts.map(({ draft: d, result }) => {
            const g = ctx.data!.goals.find((x) => x.id === d.goalId)
            return (
              <ChipButton key={d.id} onClick={() => load(d)} selected={d.id === draftId}>
                {g?.name ?? 'Ziel gelöscht'} · {ctx.data!.templates.find((t) => t.id === d.templateId)?.name ?? d.templateId}{!result.ok && ' ⚠'}
              </ChipButton>
            )
          })}
        </div>
      )}

      {ctx.data.goals.length === 0 ? (
        <Card><p className="text-body-sm">Kein kommendes Hauptrennen. Lege es auf der <Link href="/season" className="text-brand-text hover:underline">Saison-Seite</Link> an.</p></Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card title="Rennen und Vorlage">
            <div className="grid gap-4 text-body-sm">
              <label className="grid gap-1.5">
                <span className="text-muted-foreground">Rennen</span>
                <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className={select}>
                  {ctx.data.goals.map((g) => <option key={g.id} value={g.id}>{g.name} · {longDate(g.date)}{g.goalS ? ` · Ziel ${clockText(g.goalS)}` : ''}{g.confirmed ? '' : ' (Datum offen)'}</option>)}
                </select>
              </label>
              <div className="grid gap-1.5">
                <span className="text-muted-foreground">Vorlage</span>
                {fitting.length === 0 && <p className="text-caption text-error">Für dieses Rennen gibt es noch keine Vorlage.</p>}
                {fitting.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTemplateId(t.id)} aria-pressed={t.id === templateId}
                    className={cn('rounded-card px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      t.id === templateId ? 'bg-secondary ring-1 ring-inset ring-foreground' : 'bg-card shadow-hairline hover:bg-secondary')}>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="min-w-0 font-medium">{t.name}{t.own?.name ? ` · ${t.own.name}` : ''}</span>
                      {Object.keys(t.tuning).length > 0 && <span className="text-caption font-medium text-brand-text">{t.own ? `${Object.keys(t.tuning).length} eigene Werte` : 'Mein Ansatz'}</span>}
                    </span>
                    <span className="block text-caption text-muted-foreground line-clamp-2">{t.summary}</span>
                    <span className="mt-1 block text-caption tabular-nums text-muted-foreground">
                      {t.keys.runs} Läufe · {t.keys.keyBuild} Qualität im Aufbau · Erholung alle {t.keys.recoveryEvery} Wochen
                      {t.keys.taperWeeks ? ` · Taper ${t.keys.taperWeeks} W` : ''} · Longrun ≤ {Math.round(t.keys.longShare * 100)} %{t.keys.raceInLong ? ' mit Renntempo' : ''}
                    </span>
                  </button>
                ))}
              </div>
              <label className="grid gap-1.5">
                <span className="text-muted-foreground">Start (Montag der Woche)</span>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="tabular-nums" />
              </label>
            </div>
          </Card>

          <Card title="Ausgangswerte" aside={<span>leer = gemessen</span>}>
            <div className="grid gap-3 text-body-sm">
              <Measured label="Aktueller Umfang" unit="km/Woche" field="currentKm" text={text} setText={setText} draft={draft}
                hint={draft ? SOURCE[draft.inputs.currentKm.override ? 'manual' : draft.inputs.currentKmSource] : undefined} />
              <Measured label="Gehaltener Umfang (52 Wochen)" unit="km/Woche" field="provenKm" text={text} setText={setText} draft={draft} hint="höchster 4-Wochen-Schnitt" />
              <Measured label="Längster Lauf (30 Tage vor dem Start)" unit="km" field="longest30Km" text={text} setText={setText} draft={draft}
                hint={draft && !draft.inputs.longest30Km.override && draft.inputs.longest30Source === 'profile' ? 'noch kein Lauf gemessen: aus deinem Profil'
                  : draft && !draft.inputs.longest30Km.override && draft.inputs.longest30Source === 'estimate' ? 'noch kein Lauf gemessen: Wochenumfang ÷ Lauftage'
                    : 'Läufe und geplante Läufe, ohne Rennen'} />
              <Measured label="Spitze" unit="km/Woche" field="peakKm" text={text} setText={setText} draft={draft} hint={draft ? `Empfehlung ${km(draft.skeleton.peak.recommendedKm)} km` : undefined} />
              <label className="grid gap-1.5">
                <span className="text-muted-foreground">Zielzeit</span>
                <Input value={text.goalS ?? ''} onChange={(e) => setText({ ...text, goalS: e.target.value })} placeholder={goal?.goalS ? clockText(goal.goalS) : 'h:mm:ss'}
                  className="tabular-nums" />
              </label>
              <p className="text-caption text-muted-foreground">
                Letztes Rennen: {draft?.inputs.recentRace ? `${km(draft.inputs.recentRace.distanceKm)} km in ${clockText(draft.inputs.recentRace.timeS)} (${dayLabel(draft.inputs.recentRace.date)})` : 'keins in den letzten 6 Monaten'}
                {!ctx.data.profile && <> · <Link href="/plan/anpassen" className="text-brand-text hover:underline">Trainingsprofil</Link> fehlt: Standard-Lauftage (Fr Ruhe, Sa Longrun, Di/Do Qualität).</>}
              </p>
            </div>
          </Card>
        </div>
      )}

      {template && (
        <Card title={template.own ? 'Eigene Methode' : `Mein Ansatz · ${template.name}`} aside={
          <Button size="sm" onClick={() => setTuneOpen(!tuneOpen)}>
            <SlidersHorizontal /> {tuneOpen ? 'Schließen' : Object.keys(tuning).length ? `${Object.keys(tuning).length} eigene Werte` : 'Werte anpassen'}
          </Button>}>
          {!tuneOpen ? (
            template.own ? <p className="text-body-sm text-muted-foreground">Neutrale Grundlage aus den Recherchen. Jeder Wert lässt sich setzen; die Sicherheitsgrenzen gelten immer.</p> :
            <p className="text-body-sm text-muted-foreground">Die Vorlage bestimmt Läufe, Schlüsseleinheiten, Longrun, Erholung, Spitze und Taper. Hier setzt du eigene Werte;
              die Sicherheitsgrenzen gelten immer.</p>
          ) : (
            <div className="grid gap-4">
              {template.own && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-body-sm">
                    <span className="text-muted-foreground">Name deiner Methode</span>
                    <Input value={ownName} maxLength={60} onChange={(e) => setOwnName(e.target.value)} placeholder="Eigene Methode" />
                  </label>
                  <p className="self-end text-caption text-muted-foreground">Startpunkt: neutrale Werte aus den Recherchen, keine Buchmethode. Leere Felder = Grundlage.
                    Geprüft wird wie bei jeder Vorlage.</p>
                </div>
              )}
              <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...new Set(template.fields.map((f) => f.group))].map((g) => (
                  <Inset key={g} className="grid content-start gap-2.5 p-3">
                    <span className="text-caption font-medium text-muted-foreground">{g}</span>
                    {template.fields.filter((f) => f.group === g).map((f) => <TuneInput key={f.path} f={f} value={tune[f.path]}
                      paceS={f.path.startsWith('paces.offsets.') && draft ? draft.paces.racePaceS : undefined} onChange={(v) => setTune((t) => {
                      const next = { ...t }
                      if (v === undefined) delete next[f.path]; else next[f.path] = v
                      return next
                    })} />)}
                  </Inset>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="action" onClick={() => saveTune.mutate()} disabled={!tuneDirty || saveTune.isPending}>
                  <Check /> {saveTune.isPending ? 'Speichert…' : template.own ? 'Methode speichern' : 'Ansatz speichern'}
                </Button>
                <Button size="action" variant="ghost" onClick={() => setTune({})} disabled={!Object.keys(tune).length}>
                  <RotateCcw /> {template.own ? 'Alles wie die Grundlage' : 'Alles wie in der Vorlage'}
                </Button>
                <span className="text-caption text-muted-foreground">{tuneDirty ? 'Vorschau rechnet schon mit deinen Werten, gespeichert ist noch nichts.' : saveTune.isSuccess ? `Gespeichert: gilt für jeden Entwurf mit ${template.own ? 'deiner Methode' : 'dieser Vorlage'}.` : ''}</span>
                {saveTune.isError && <span className="text-caption text-error">{(saveTune.error as Error).message}</span>}
              </div>
              {template.own && !features.ownMethod && <Upsell feature="ownMethod" />}
              {template.own && template.own.compare.length > 0 && <Compare t={template} tuning={tuning} id={compareId} setId={setCompareId} />}
            </div>
          )}
        </Card>
      )}

      {preview.isFetching && !r && <p className="text-body-sm text-muted-foreground">Rechnet…</p>}
      {r && !r.ok && <p className="flex items-center gap-1.5 text-body-sm text-error"><AlertTriangle className="h-4 w-4 shrink-0" />{(r as { error: string }).error}</p>}
      {draft && <Review d={draft} stale={preview.isFetching} />}

      {draft && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            <Check /> {save.isPending ? 'Speichert…' : draftId ? 'Entwurf aktualisieren' : 'Entwurf speichern'}
          </Button>
          {note && <span className="min-w-0 text-body-sm text-teal-text">{note}</span>}
          {save.isError && <span className="text-body-sm text-error">{(save.error as Error).message}</span>}
        </div>
      )}

      {draft && goal && (() => {
        const current = ctx.data!.live.find((l) => l.goalId === goal.id)
        const busy = live.isPending || offline.isPending
        const error = (live.error ?? offline.error) as Error | null
        return (
          <Card title="Live schalten" aside={current ? <Chip tone="teal">live seit {dayLabel(current.liveAt.slice(0, 10))}</Chip> : undefined}>
            {current ? (
              <div className="grid gap-3 text-body-sm">
                <p>Dein laufender Plan für {current.name}: {longDate(current.planStart)} bis {longDate(current.end)}. Er bleibt so, auch wenn du diesen Entwurf änderst.</p>
                {confirm === 'offline' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-brand-text">Offline nehmen? Ab {dayLabel(current.planStart)} ist dann kein Plan mehr da.</span>
                    <Button variant="destructive" size="action" onClick={() => offline.mutate(current.id)} disabled={busy}>Ja, offline nehmen</Button>
                    <Button size="action" onClick={() => setConfirm(null)}>Abbrechen</Button>
                  </div>
                ) : (
                  <Button size="action" className="w-fit" onClick={() => setConfirm('offline')}><Power /> Offline nehmen</Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 text-body-sm">
                <p>Ab {longDate(draft.skeleton.weeks[0].start)} wird dieser Entwurf dein laufender Plan: Plan-Seite, Heute, Kalender und Engine lesen ihn dann.
                  Bis dahin bleibt alles, wie es ist. Danach ändert er sich nicht mehr mit Vorlage oder Profil.</p>
                {confirm === 'live' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Speichern und live schalten?</span>
                    <Button variant="primary" size="action" onClick={() => live.mutate()} disabled={busy}>{busy ? 'Schaltet…' : 'Ja, live schalten'}</Button>
                    <Button size="action" onClick={() => setConfirm(null)}>Abbrechen</Button>
                  </div>
                ) : (
                  <Button size="action" className="w-fit" onClick={() => setConfirm('live')}><Power /> Live schalten</Button>
                )}
              </div>
            )}
            {error && <p className="mt-2 text-body-sm text-error">{error.message}</p>}
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
    <div className="grid gap-2 rounded-card p-3 shadow-hairline">
      <div className="flex flex-wrap items-center gap-2 text-body-sm">
        <span className="text-muted-foreground">Vergleich mit</span>
        <select value={other.id} onChange={(e) => setId(e.target.value)} className={cn(select, 'h-8 w-auto px-2')}>
          {t.own!.compare.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-caption text-muted-foreground">{rows.length ? `${rows.length} Werte anders` : 'gleiche Werte'}</span>
      </div>
      {rows.length > 0 && (
        <div className="grid gap-x-6 gap-y-1 text-caption sm:grid-cols-2 lg:grid-cols-3">
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm">
        <span className="min-w-0">{f.label}</span>
        <span className="flex flex-wrap items-center gap-1">
          {f.options!.map((o) => (
            <button key={o.value} type="button" aria-pressed={cur === o.value} onClick={() => onChange(o.value === f.template ? undefined : o.value)}
              className={toggle(cur === o.value, own)}>{o.label}</button>
          ))}
        </span>
      </div>
    )
  }
  if (f.kind === 'bool') {
    const cur = typeof value === 'boolean' ? value : (f.template as boolean)
    return (
      <div className="flex items-center justify-between gap-2 text-body-sm">
        <span className="min-w-0">{f.label}</span>
        <span className="flex items-center gap-1">
          {(['ja', 'nein'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={cur === (l === 'ja')} onClick={() => onChange((l === 'ja') === f.template ? undefined : l === 'ja')}
              className={toggle(cur === (l === 'ja'), own)}>{l}</button>
          ))}
        </span>
      </div>
    )
  }
  return (
    <label className="grid gap-1 text-body-sm">
      <span className="flex items-baseline justify-between gap-2">
        <span className="min-w-0">{f.label}</span>
        {own && <button type="button" onClick={() => onChange(undefined)} className="tap shrink-0 text-caption text-muted-foreground hover:text-foreground">Vorlage {shown(f.template as number)}</button>}
      </span>
      <span className="flex items-center gap-2">
        <Input small inputMode="decimal" value={typeof value === 'string' ? value : ''} placeholder={shown(f.template as number)} onChange={(e) => onChange(e.target.value)}
          className={cn('tabular-nums', own && 'ring-1 ring-brand')} />
        {f.unit && <span className="shrink-0 text-caption text-muted-foreground">{f.unit}</span>}
      </span>
      {(f.hint || paceS) && <span className="text-caption text-muted-foreground">{[f.hint, paceS ? `= ${fmtPace(paceS + (own ? Number(String(value).replace(',', '.')) || 0 : f.template as number))}/km beim Ziel` : null].filter(Boolean).join(' · ')}</span>}
    </label>
  )
}

// A start value: empty means measured (the measured value is the placeholder).
function Measured({ label, unit, field, text, setText, draft, hint }: {
  label: string; unit: string; field: Field; text: Partial<Record<Field, string>>; setText: (t: Partial<Record<Field, string>>) => void; draft: Draft | null; hint?: string
}) {
  const measured = draft?.inputs[field].measured
  return (
    <label className="grid gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <Input inputMode="decimal" value={text[field] ?? ''} onChange={(e) => setText({ ...text, [field]: e.target.value })}
          placeholder={measured != null ? km(measured) : '–'} className="tabular-nums" />
        <span className="shrink-0 text-caption text-muted-foreground">{unit}</span>
      </span>
      {hint && <span className="text-caption text-muted-foreground">{text[field]?.trim() ? 'von dir gesetzt' : hint}</span>}
    </label>
  )
}

function Review({ d, stale }: { d: Draft; stale: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  const sessions = [...d.workouts.sessions, ...(d.recovery?.sessions ?? [])]   // incl. the recovery weeks after the race (07-22)
  const tests = sessions.filter((s) => s.test)
  return (
    // From lg up the draft summary and the notes sit side by side (each at its natural height); the weeks span the width.
    <div className={cn('grid items-start gap-4 transition-opacity lg:grid-cols-12', stale && 'opacity-60')}>
      <Card title="Entwurf" className={d.warnings.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Wochen" value={d.skeleton.weeks.length} />
          <Figure label="Spitze" value={km(d.skeleton.peakKm)} unit="km" />
          <Figure label="Renntempo" value={d.paces.fmt[d.distance === 'marathon' ? 'marathon_pace' : d.distance === 'half' ? 'half_marathon_pace' : 'threshold']} unit="/km" />
          <Figure label="Tests" value={tests.length ? tests.map((s) => dayLabel(s.date)).join(', ') : '–'} />
        </div>
        <div className="mt-4 grid gap-1 text-body-sm">
          <span className="font-mono text-caption uppercase text-muted-foreground">Warum diese Spitze</span>
          {d.skeleton.peak.why.map((line, i) => <p key={i} className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{line}</p>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(['easy', 'long', 'threshold', 'intervals_vo2', 'half_marathon_pace', 'marathon_pace'] as const).map((p) => (
            <Chip key={p} className="tabular-nums">{{ easy: 'Locker', long: 'Longrun', threshold: 'Schwelle', intervals_vo2: 'VO2max', half_marathon_pace: 'HM-Tempo', marathon_pace: 'M-Tempo' }[p]} {d.paces.fmt[p]}</Chip>
          ))}
        </div>
      </Card>

      {d.warnings.length > 0 && (
        <Card title="Hinweise" aside={<span className="tabular-nums">{d.warnings.length}</span>} className="lg:col-span-5">
          <ul className="grid gap-1.5 text-body-sm">
            {d.warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span><span className="text-muted-foreground">{w.step}: </span>{w.text}</span></li>)}
          </ul>
        </Card>
      )}

      <Card title="Wochen" className="lg:col-span-12">
        <div className="grid gap-1">
          {[...d.days.weeks, ...(d.recovery?.weeks ?? [])].map((w, i) => {
            const sk = d.skeleton.weeks[i] as (typeof d.skeleton.weeks)[number] | undefined
            const days = sessions.filter((s) => s.date >= w.start && s.date <= w.end)
            const isOpen = open === w.start
            return (
              <div key={w.start} className="border-t border-border first:border-t-0">
                <button onClick={() => setOpen(isOpen ? null : w.start)} className="tap flex w-full items-center gap-2 py-2 text-left text-body-sm">
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="w-14 shrink-0 tabular-nums font-medium">KW {w.kw}</span>
                  <span className="w-16 shrink-0 text-caption text-muted-foreground tabular-nums">{dayLabel(w.start)}</span>
                  <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{sk ? <>{PHASE[sk.phase]}{w.focus.includes('·') ? ` · ${w.focus.split(' · ').slice(1).join(' · ')}` : ''}</> : w.focus.replace(/ \([^)]*\)$/, '')}</span>
                  <span className="shrink-0 tabular-nums">{km(w.km)} km</span>
                </button>
                {isOpen && (
                  <ul className="grid gap-2 pb-3 pl-6 text-body-sm">
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
        <span className="w-14 shrink-0 text-caption tabular-nums text-muted-foreground">{dayLabel(s.date)}</span>
        <TypeTag type={s.type} />
        {s.type !== 'rest' && <span className="tabular-nums">{km(s.km)} km</span>}
        {s.key && <Star className="h-3.5 w-3.5 text-warning" aria-label="Schlüsseleinheit" />}
        {s.test && <Chip tone="brand">{s.test}</Chip>}
        {s.strength && <Chip tone="neutral" className="border border-dashed border-border">Kettlebell {s.strength.minMin}–{s.strength.maxMin} Min.{s.strength.optional ? ' (optional)' : ''}</Chip>}
      </span>
      {s.notes && s.type !== 'rest' && <span className="pl-16 text-caption text-muted-foreground">{s.notes}</span>}
    </li>
  )
}
