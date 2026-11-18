'use client'

// Einrichten (Phase 5): consent (hosted only) → profile → data source → goal and first plan, or a base block without a
// goal. Every step is saved on the server (/api/onboarding), so a reload or a later visit resumes at the same step.
// The source and goal steps reuse the Settings cards and the plan generator's routes (/api/season, /api/running/drafts).
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Check, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/plan/ui'
import { HealthConsentCard } from '@/components/settings/HealthConsentCard'
import { GarminSource } from '@/components/settings/GarminSource'
import { HealthCard } from '@/components/settings/HealthCard'
import { ImportCard } from '@/components/settings/ImportCard'
import { useEntitlements } from '@/components/billing/Entitlements'
import { SKIPPABLE, STEP_LABEL, type Step } from '@/lib/onboarding/flow'
import { HRMAX_AGE, RACE_LABEL, estimateHrMax, type ProfileInput, type RaceDistance } from '@/lib/onboarding/profile'
import type { OnboardingView } from '@/lib/onboarding/store'
import { EXPERIENCE_LABEL, WEEKDAYS, type Experience, type Weekday } from '@/lib/plan/athlete-profile'
import type { HealthConsentStatus } from '@/lib/legal/consent-text'
import type { SourcesResponse } from '@/lib/sources/types'
import type { DraftResult } from '@/lib/plan/generator/draft'
import { parseClock, type SeasonGoal } from '@/lib/season/goals'

type View = OnboardingView & { notes?: string[] }
const box = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums outline-none focus:border-foreground/60'
const primary = 'rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
const secondary = 'rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50'
const longDate = (d: string) => format(parseISO(d), 'EEEE, d. MMMM yyyy', { locale: de })

async function post(body: unknown): Promise<View> {
  const r = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? 'Speichern fehlgeschlagen')
  return d as View
}

export default function OnboardingPage() {
  const qc = useQueryClient()
  const { data: view } = useQuery<View>({ queryKey: ['onboarding'], queryFn: () => fetch('/api/onboarding').then((r) => r.json()) })
  const [notes, setNotes] = useState<string[]>([])
  const step = useMutation({
    mutationFn: post,
    onSuccess: (v) => { qc.setQueryData(['onboarding'], v); setNotes(v.notes ?? []); window.scrollTo({ top: 0 }) },
  })
  const finish = useMutation({ mutationFn: () => post({ type: 'finish' }), onSuccess: () => { window.location.href = '/plan' } })
  if (!view) return <p className="text-sm text-muted-foreground">Lädt…</p>
  const send = (body: unknown) => step.mutate(body)
  const current = view.current
  const index = current ? view.steps.indexOf(current) : view.steps.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Willkommen bei Runmate</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ein paar Schritte, dann steht dein erster Plan. Alles lässt sich später in den Einstellungen ändern.</p>
      </div>
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Fortschritt">
        {view.steps.map((s, i) => {
          const done = view.state.done.includes(s), skipped = view.state.skipped.includes(s)
          return (
            <li key={s} aria-current={s === current ? 'step' : undefined}
              className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1',
                s === current ? 'border-brand bg-brand-soft font-medium text-brand' : done ? 'border-border text-foreground' : 'border-border text-muted-foreground')}>
              {done ? <Check className="h-3.5 w-3.5 text-teal" /> : <span className="tabular-nums">{i + 1}</span>}
              {STEP_LABEL[s]}{skipped ? ' · übersprungen' : SKIPPABLE.includes(s) ? ' · optional' : ''}
            </li>
          )
        })}
      </ol>
      {notes.map((n) => <p key={n} className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">{n}</p>)}

      {current === 'consent' && <ConsentStep onNext={() => send({ type: 'complete', step: 'consent' })} />}
      {current === 'profile' && <ProfileStep view={view} busy={step.isPending} onSave={(profile) => send({ type: 'complete', step: 'profile', profile })} />}
      {current === 'source' && <SourceStep busy={step.isPending} onNext={() => send({ type: 'complete', step: 'source' })} onSkip={() => send({ type: 'skip', step: 'source' })} />}
      {current === 'goal' && <GoalStep view={view} busy={step.isPending} onLive={() => send({ type: 'complete', step: 'goal' })} onBase={() => send({ type: 'skip', step: 'goal' })} />}
      {!current && <DoneStep view={view} busy={finish.isPending} onFinish={() => finish.mutate()} />}

      {(step.error ?? finish.error) && <p className="text-sm text-red-600">{((step.error ?? finish.error) as Error).message}</p>}
      {index > 0 && (
        <button onClick={() => send({ type: 'back' })} disabled={step.isPending} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Zurück
        </button>
      )}
    </div>
  )
}

// ─── 1 Einwilligung (hosted only) ─────────────────────────────────────────────

function ConsentStep({ onNext }: { onNext: () => void }) {
  const { data } = useQuery<HealthConsentStatus>({ queryKey: ['health-consent'], queryFn: () => fetch('/api/consent/health').then((r) => r.json()) })
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Runmate arbeitet mit Herzfrequenz, Schlaf und Gewicht – das sind Gesundheitsdaten. Dafür brauchen wir deine
        ausdrückliche Einwilligung, getrennt von den AGB. Du kannst sie jederzeit in den Einstellungen widerrufen.
      </p>
      <HealthConsentCard />
      <button onClick={onNext} disabled={!data?.granted} className={primary}>Weiter</button>
    </div>
  )
}

// ─── 2 Profil ─────────────────────────────────────────────────────────────────

const browserTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'Europe/Berlin' } }
const num = (t: string) => (t.trim() === '' ? null : Number(t.replace(',', '.')))

function ProfileStep({ view, busy, onSave }: { view: View; busy: boolean; onSave: (p: ProfileInput) => void }) {
  const u = view.profile, a = view.athlete
  const [hrMax, setHrMax] = useState(u?.hrMax ? String(u.hrMax) : '')
  const [hrMaxUnknown, setHrMaxUnknown] = useState(false)
  const [age, setAge] = useState(a?.age ? String(a.age) : '')
  const [hrRest, setHrRest] = useState(u?.hrRest ? String(u.hrRest) : '')
  const [hrRestUnknown, setHrRestUnknown] = useState(false)
  const [raceDistance, setRaceDistance] = useState<RaceDistance | ''>('')
  const [raceTime, setRaceTime] = useState('')
  const [weight, setWeight] = useState(u?.weightKg ? String(u.weightKg) : '')
  const [timezone, setTimezone] = useState(u?.timezone ?? browserTimeZone())
  const [weeklyKm, setWeeklyKm] = useState(a?.weeklyKm != null ? String(a.weeklyKm) : '')
  const [experience, setExperience] = useState<Experience | ''>(a?.experience ?? '')
  const [runDays, setRunDays] = useState<Weekday[]>(a?.availableDays ?? [1, 2, 4, 6, 7])
  const [longRunDay, setLongRunDay] = useState<Weekday>(a?.longRunDay ?? 7)
  const ageN = num(age)
  const estimate = hrMaxUnknown && ageN != null && ageN >= HRMAX_AGE[0] && ageN <= HRMAX_AGE[1] ? estimateHrMax(ageN) : null
  const toggle = (d: Weekday) => setRunDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))
  const submit = () => onSave({
    hrMax: hrMaxUnknown ? null : num(hrMax), hrMaxUnknown, age: ageN, hrRest: hrRestUnknown ? null : num(hrRest),
    race: raceDistance && raceTime.trim() ? { distance: raceDistance, time: raceTime } : null,
    weightKg: num(weight), timezone: timezone.trim() || null, weeklyKm: num(weeklyKm), experience: experience || null,
    runDays, longRunDay,
  })
  return (
    <Card title="Dein Profil">
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Puls</legend>
          <label className="grid gap-1 text-sm">HFmax (Schläge/min)
            <input inputMode="numeric" className={box} value={hrMaxUnknown ? (estimate ? `≈ ${estimate}` : '') : hrMax} disabled={hrMaxUnknown}
              onChange={(e) => setHrMax(e.target.value)} placeholder="z. B. 188" />
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={hrMaxUnknown} onChange={(e) => setHrMaxUnknown(e.target.checked)} /> weiß ich nicht – aus dem Alter schätzen
            </span>
          </label>
          <label className="grid gap-1 text-sm">Alter{hrMaxUnknown ? ' (für die Schätzung)' : ' (optional)'}
            <input inputMode="numeric" className={box} value={age} onChange={(e) => setAge(e.target.value)} required={hrMaxUnknown} />
            {hrMaxUnknown && <span className="text-xs text-muted-foreground">208 − 0,7 × Alter. Eine Schätzung: die echte HFmax kann gut 10 Schläge abweichen.</span>}
          </label>
          <label className="grid gap-1 text-sm">Ruhepuls
            <input inputMode="numeric" className={box} value={hrRestUnknown ? '' : hrRest} disabled={hrRestUnknown} onChange={(e) => setHrRest(e.target.value)} placeholder="morgens im Bett, z. B. 52" />
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={hrRestUnknown} onChange={(e) => setHrRestUnknown(e.target.checked)} /> weiß ich nicht – Beispielwert nutzen (markiert)
            </span>
          </label>
          <label className="grid gap-1 text-sm">Gewicht in kg (optional)
            <input inputMode="decimal" className={box} value={weight} onChange={(e) => setWeight(e.target.value)} />
            <span className="text-xs text-muted-foreground">Nur für die Kohlenhydrat-Mengen vor dem Rennen.</span>
          </label>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Form</legend>
          <label className="grid gap-1 text-sm">Bestzeit oder letztes Rennen (optional)
            <select className={box} value={raceDistance} onChange={(e) => setRaceDistance(e.target.value as RaceDistance | '')}>
              <option value="">keins</option>
              {(Object.keys(RACE_LABEL) as RaceDistance[]).map((d) => <option key={d} value={d}>{RACE_LABEL[d]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Zeit
            <input className={box} value={raceTime} onChange={(e) => setRaceTime(e.target.value)} placeholder="h:mm:ss oder mm:ss" disabled={!raceDistance} />
            <span className="text-xs text-muted-foreground">Daraus kommen deine Trainingstempi, sonst aus der Zielzeit.</span>
          </label>
          <label className="grid gap-1 text-sm">Kilometer pro Woche zurzeit
            <input inputMode="decimal" className={box} value={weeklyKm} onChange={(e) => setWeeklyKm(e.target.value)} placeholder="z. B. 35" />
          </label>
          <label className="grid gap-1 text-sm">Lauferfahrung
            <select className={box} value={experience} onChange={(e) => setExperience(e.target.value as Experience | '')}>
              <option value="">keine Angabe</option>
              {(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((x) => <option key={x} value={x}>{EXPERIENCE_LABEL[x].label} ({EXPERIENCE_LABEL[x].description})</option>)}
            </select>
          </label>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Woche</legend>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lauftage">
            {WEEKDAYS.map(({ d, short }) => (
              <button key={d} type="button" onClick={() => toggle(d)} aria-pressed={runDays.includes(d)}
                className={cn('w-11 rounded-lg border py-1.5 text-sm', runDays.includes(d) ? 'border-brand bg-brand-soft font-medium text-brand' : 'border-border text-muted-foreground')}>{short}</button>
            ))}
          </div>
          <label className="grid gap-1 text-sm sm:max-w-xs">Longrun am
            <select className={box} value={longRunDay} onChange={(e) => setLongRunDay(Number(e.target.value) as Weekday)}>
              {WEEKDAYS.filter((w) => runDays.includes(w.d)).map((w) => <option key={w.d} value={w.d}>{w.long}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:max-w-xs">Zeitzone
            <input className={box} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            <span className="text-xs text-muted-foreground">Von deinem Browser übernommen; bestimmt, wann für dich „heute“ ist.</span>
          </label>
        </fieldset>
        <button type="submit" disabled={busy || !runDays.length} className={cn(primary, 'w-fit')}>Speichern und weiter</button>
      </form>
    </Card>
  )
}

// ─── 3 Datenquelle (optional) ─────────────────────────────────────────────────

function SourceStep({ busy, onNext, onSkip }: { busy: boolean; onNext: () => void; onSkip: () => void }) {
  const { data } = useQuery<SourcesResponse>({ queryKey: ['sources'], queryFn: () => fetch('/api/sources').then((r) => r.json()) })
  const sources = data?.sources ?? []
  const pull = sources.filter((s) => s.available && s.capabilities.mode === 'pull')
  const otherRunSource = sources.some((s) => s.id !== 'apple-health' && s.available && s.capabilities.runs && s.capabilities.mode !== 'upload' && s.status.connected)
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Woher sollen deine Läufe kommen? Verbinde eine Quelle oder lade Dateien hoch (z. B. den Garmin-Export). Mit deinen
        bisherigen Läufen misst Runmate deinen aktuellen Umfang, statt ihn zu schätzen. Das geht auch später in den Einstellungen.
      </p>
      {pull.map((s) => <GarminSource key={s.id} source={s} />)}
      <HealthCard otherRunSource={otherRunSource} />
      <ImportCard />
      <div className="flex flex-wrap gap-2">
        <button onClick={onNext} disabled={busy} className={primary}>Weiter</button>
        <button onClick={onSkip} disabled={busy} className={secondary}>Überspringen</button>
      </div>
    </div>
  )
}

// ─── 4 Ziel und erster Plan (optional: Grundlage ohne Ziel) ───────────────────

type Template = { id: string; name: string; summary: string; distances: string[]; own?: unknown }
type DraftsCtx = { goals: SeasonGoal[]; templates: Template[]; defaultStart: string }
const GOAL_KINDS = [['half', 'Halbmarathon', 'half'], ['marathon', 'Marathon', 'marathon'], ['10k', '10 km', '10k']] as const

async function json<T>(url: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d?.ok === false) throw new Error(d.error ?? 'Fehlgeschlagen')
  return d as T
}

function GoalStep({ view, busy, onLive, onBase }: { view: View; busy: boolean; onLive: () => void; onBase: () => void }) {
  const [mode, setMode] = useState<'race' | 'base' | null>(view.live.length ? 'race' : null)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<(typeof GOAL_KINDS)[number][0]>('half')
  const [goalTime, setGoalTime] = useState('')
  const [goalId, setGoalId] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState('')
  const [currentKm, setCurrentKm] = useState(view.athlete?.weeklyKm != null ? String(view.athlete.weeklyKm) : '')
  const [preview, setPreview] = useState<DraftResult | null>(null)
  const ctx = useQuery<DraftsCtx>({ queryKey: ['drafts'], queryFn: () => fetch('/api/running/drafts').then((r) => r.json()), enabled: !!goalId })
  const fitting = (ctx.data?.templates ?? []).filter((t) => !t.own && t.distances.includes(GOAL_KINDS.find((k) => k[0] === kind)![2]))
  useEffect(() => { if (fitting.length && !fitting.some((t) => t.id === templateId)) setTemplateId(fitting[0].id) }, [fitting, templateId])
  const overrides = !view.hasRuns && currentKm.trim() ? { currentKm: Number(currentKm.replace(',', '.')) } : {}
  const choice = () => ({ goalId, templateId, start: ctx.data!.defaultStart, overrides })

  const saveGoal = useMutation({
    mutationFn: async () => {
      const goalS = parseClock(goalTime)
      if (!goalS) throw new Error('Zielzeit bitte als h:mm oder h:mm:ss.')
      const r = await json<{ goals: SeasonGoal[] }>('/api/season', 'PUT', { goal: { kind, priority: 'A', name: name.trim(), date, confirmed: true, distanceKm: null, goalS, loops: null } })
      const g = r.goals.find((x) => x.name === name.trim() && x.date === date && x.priority === 'A')
      if (!g) throw new Error('Ziel nicht gespeichert.')
      return g.id
    },
    onSuccess: (id) => { setGoalId(id); setPreview(null) },
  })
  const makePreview = useMutation({ mutationFn: () => json<DraftResult>('/api/running/drafts', 'POST', choice()), onSuccess: setPreview })
  const goLive = useMutation({
    mutationFn: async () => {
      const { draft } = await json<{ draft: { id: string } }>('/api/running/drafts', 'PUT', { draft: choice() })
      await json('/api/running/drafts', 'POST', { action: 'live', draftId: draft.id })
    },
    onSuccess: onLive,
  })
  const error = (saveGoal.error ?? makePreview.error ?? goLive.error) as Error | null

  if (view.live.length) {
    return (
      <Card title="Dein Plan ist live">
        <p className="text-sm">{view.live[0].name}: ab {longDate(view.live[0].planStart)}.</p>
        <button onClick={onLive} disabled={busy} className={cn(primary, 'mt-4')}>Weiter</button>
      </Card>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => setMode('race')} aria-pressed={mode === 'race'}
          className={cn('rounded-2xl border p-4 text-left', mode === 'race' ? 'border-brand bg-brand-soft' : 'border-border bg-card')}>
          <span className="block text-sm font-semibold">Auf ein Rennen hin</span>
          <span className="mt-1 block text-xs text-muted-foreground">Rennen, Zielzeit und Methode wählen; Runmate rechnet den Plan bis zum Renntag.</span>
        </button>
        <button onClick={() => setMode('base')} aria-pressed={mode === 'base'}
          className={cn('rounded-2xl border p-4 text-left', mode === 'base' ? 'border-brand bg-brand-soft' : 'border-border bg-card')}>
          <span className="block text-sm font-semibold">Erstmal ohne Ziel</span>
          <span className="mt-1 block text-xs text-muted-foreground">Grundlage: lockere Wochen auf deinem Niveau, eine Schlüsseleinheit, jede vierte Woche leichter.</span>
        </button>
      </div>

      {mode === 'base' && (
        <Card title="Grundlage ohne Ziel">
          <p className="text-sm text-muted-foreground">
            Ab {longDate(view.nextMonday)} plant Runmate immer vier Wochen voraus: Umfang auf dem Niveau deiner letzten
            Wochen{view.hasRuns ? '' : ` (bis Läufe da sind: ${view.athlete?.weeklyKm ?? 30} km aus deinem Profil)`}, höchstens 5 % mehr pro Woche.
            Sobald du ein Rennen anlegst und einen Plan übernimmst, löst er die Grundlage ab.
          </p>
          <button onClick={onBase} disabled={busy} className={cn(primary, 'mt-4')}>Grundlage starten</button>
        </Card>
      )}

      {mode === 'race' && (
        <Card title="Dein Rennen">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveGoal.mutate() }}>
            <label className="grid gap-1 text-sm">Name<input className={box} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="z. B. Herbst-Halbmarathon" /></label>
            <label className="grid gap-1 text-sm">Datum<input type="date" className={box} value={date} onChange={(e) => setDate(e.target.value)} required /></label>
            <label className="grid gap-1 text-sm">Distanz
              <select className={box} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {GOAL_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Zielzeit<input className={box} value={goalTime} onChange={(e) => setGoalTime(e.target.value)} required placeholder="h:mm oder h:mm:ss" /></label>
            <button type="submit" disabled={saveGoal.isPending || !!goalId} className={cn(primary, 'w-fit')}>{goalId ? 'Gespeichert' : 'Rennen speichern'}</button>
          </form>
          {goalId && ctx.data && (
            <div className="mt-5 grid gap-3 border-t border-border pt-4">
              <label className="grid gap-1 text-sm">Methode
                <select className={box} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setPreview(null) }}>
                  {fitting.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span className="text-xs text-muted-foreground">{fitting.find((t) => t.id === templateId)?.summary}</span>
              </label>
              {!view.hasRuns && (
                <label className="grid gap-1 text-sm sm:max-w-xs">Kilometer pro Woche zurzeit
                  <input inputMode="decimal" className={box} value={currentKm} onChange={(e) => { setCurrentKm(e.target.value); setPreview(null) }} required />
                  <span className="text-xs text-muted-foreground">Noch keine Läufe da – der Plan beginnt bei diesem Umfang.</span>
                </label>
              )}
              <p className="text-xs text-muted-foreground">Start: {longDate(ctx.data.defaultStart)}.</p>
              <button onClick={() => makePreview.mutate()} disabled={makePreview.isPending || !templateId} className={cn(secondary, 'w-fit')}>Entwurf ansehen</button>
            </div>
          )}
          {preview?.ok && <DraftPreview draft={preview} />}
          {preview?.ok && <button onClick={() => goLive.mutate()} disabled={goLive.isPending || busy} className={cn(primary, 'mt-4')}>Plan übernehmen</button>}
          {preview && !preview.ok && <p className="mt-3 text-sm text-red-600">{preview.error}</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error.message}</p>}
        </Card>
      )}
    </div>
  )
}

function DraftPreview({ draft }: { draft: Extract<DraftResult, { ok: true }> }) {
  const weeks = draft.days.weeks
  const keys = (start: string, end: string) => draft.workouts.sessions.filter((s) => s.date >= start && s.date <= end && s.key).map((s) => s.title)
  const peak = Math.max(...weeks.map((w) => w.km))
  return (
    <div className="mt-5 grid gap-3 border-t border-border pt-4">
      <p className="text-sm">{weeks.length} Wochen, Spitze {String(peak).replace('.', ',')} km. Renntempo {draft.paces.fmt.race}/km, locker {draft.paces.fmt.easy}/km.</p>
      <ul className="grid gap-1.5 text-sm">
        {weeks.map((w, i) => (
          <li key={w.start} className="grid grid-cols-[3rem_1fr] gap-2">
            <span className="tabular-nums text-muted-foreground">W{i + 1}</span>
            <span><span className="tabular-nums">{String(w.km).replace('.', ',')} km</span> · {w.focus}{keys(w.start, w.end).length ? ` · ${keys(w.start, w.end).join(', ')}` : ''}</span>
          </li>
        ))}
      </ul>
      {draft.warnings.length > 0 && (
        <ul className="grid gap-1 text-xs text-muted-foreground">{draft.warnings.map((w) => <li key={w.text}>Hinweis ({w.step}): {w.text}</li>)}</ul>
      )}
    </div>
  )
}

// ─── Fertig ───────────────────────────────────────────────────────────────────

function DoneStep({ view, busy, onFinish }: { view: View; busy: boolean; onFinish: () => void }) {
  const e = useEntitlements()
  return (
    <Card title="Fertig">
      <p className="text-sm">
        {view.state.goal === 'base' ? `Deine Grundlage beginnt am ${longDate(view.baseStart ?? view.nextMonday)}.`
          : view.live[0] ? `${view.live[0].name}: dein Plan beginnt am ${longDate(view.live[0].planStart)}.` : 'Alles eingerichtet.'}
        {view.state.skipped.includes('source') ? ' Eine Datenquelle verbindest du jederzeit unter Einstellungen → Datenquellen.' : ''}
      </p>
      {e.state === 'trial' && e.trialEndsAt && (
        <p className="mt-2 text-sm text-muted-foreground">Deine Testphase läuft bis {format(new Date(e.trialEndsAt * 1000), 'd. MMMM yyyy', { locale: de })} – ohne Zahlungsdaten. Danach geht es kostenlos weiter.</p>
      )}
      <button onClick={onFinish} disabled={busy} className={cn(primary, 'mt-4')}>Zum Plan</button>
    </Card>
  )
}
