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
import { Button, Card, CheckRow, ChipButton, Field, Inset, Input, Select, fieldDescribedBy } from '@/components/ui'
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
import { fmtPace } from '@/lib/plan/generator/paces'
import { parseClock, type SeasonGoal } from '@/lib/season/goals'

type View = OnboardingView & { notes?: string[] }
const longDate = (d: string) => format(parseISO(d), 'EEEE, d. MMMM yyyy', { locale: de })
// Fieldset legends: the small uppercase mono eyebrow.
const legend = 'mb-2 font-mono text-caption uppercase text-muted-foreground'

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
  if (!view) return <p className="text-body-sm text-muted-foreground">Lädt…</p>
  const send = (body: unknown) => step.mutate(body)
  const current = view.current
  const index = current ? view.steps.indexOf(current) : view.steps.length

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="text-title">Willkommen bei Runmate</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">Ein paar Schritte, dann steht dein erster Plan. Alles lässt sich später in den Einstellungen ändern.</p>
      </div>
      <ol className="flex flex-wrap gap-2 text-caption" aria-label="Fortschritt">
        {view.steps.map((s: Step, i) => {
          const done = view.state.done.includes(s), skipped = view.state.skipped.includes(s)
          return (
            <li key={s} aria-current={s === current ? 'step' : undefined}
              className={cn('flex h-7 items-center gap-1.5 rounded-control px-2.5',
                s === current ? 'bg-brand-soft font-medium text-brand-text' : done ? 'bg-card text-foreground shadow-hairline' : 'bg-card text-muted-foreground shadow-hairline')}>
              {done ? <Check className="h-3.5 w-3.5 text-teal" /> : <span className="tabular-nums">{i + 1}</span>}
              {STEP_LABEL[s]}{skipped ? ' · übersprungen' : SKIPPABLE.includes(s) ? ' · optional' : ''}
            </li>
          )
        })}
      </ol>
      {notes.map((n) => <Inset key={n} className="px-4 py-3 text-body-sm">{n}</Inset>)}

      {current === 'consent' && <ConsentStep onNext={() => send({ type: 'complete', step: 'consent' })} />}
      {current === 'profile' && <ProfileStep view={view} busy={step.isPending} onSave={(profile) => send({ type: 'complete', step: 'profile', profile })} />}
      {current === 'source' && <SourceStep busy={step.isPending} onNext={() => send({ type: 'complete', step: 'source' })} onSkip={() => send({ type: 'skip', step: 'source' })} />}
      {current === 'goal' && <GoalStep view={view} busy={step.isPending} onLive={() => send({ type: 'complete', step: 'goal' })} onBase={() => send({ type: 'skip', step: 'goal' })} />}
      {!current && <DoneStep view={view} busy={finish.isPending} onFinish={() => finish.mutate()} />}

      {(step.error ?? finish.error) && <p role="alert" className="text-body-sm text-error">{((step.error ?? finish.error) as Error).message}</p>}
      {index > 0 && (
        <Button variant="ghost" className="-ml-2 w-fit" onClick={() => send({ type: 'back' })} disabled={step.isPending}>
          <ChevronLeft /> Zurück
        </Button>
      )}
    </div>
  )
}

// ─── 1 Einwilligung (hosted only) ─────────────────────────────────────────────

function ConsentStep({ onNext }: { onNext: () => void }) {
  const { data } = useQuery<HealthConsentStatus>({ queryKey: ['health-consent'], queryFn: () => fetch('/api/consent/health').then((r) => r.json()) })
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-muted-foreground">
        Runmate arbeitet mit Herzfrequenz, Schlaf und Gewicht – das sind Gesundheitsdaten. Dafür brauchen wir deine
        ausdrückliche Einwilligung, getrennt von den AGB. Du kannst sie jederzeit in den Einstellungen widerrufen.
      </p>
      <HealthConsentCard />
      <Button variant="primary" className="w-fit" onClick={onNext} disabled={!data?.granted}>Weiter</Button>
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
  const [longest, setLongest] = useState(a?.longestRunKm != null ? String(a.longestRunKm).replace('.', ',') : '')
  const [experience, setExperience] = useState<Experience | ''>(a?.experience ?? '')
  const [runDays, setRunDays] = useState<Weekday[]>(a?.availableDays ?? [1, 2, 4, 6, 7])
  const [longRunDay, setLongRunDay] = useState<Weekday>(a?.longRunDay ?? 7)
  const ageN = num(age)
  const guess = hrMaxUnknown || !hrMax.trim()      // an empty HFmax is estimated from the age as well
  const estimate = hrMaxUnknown && ageN != null && ageN >= HRMAX_AGE[0] && ageN <= HRMAX_AGE[1] ? estimateHrMax(ageN) : null
  const toggle = (d: Weekday) => setRunDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))
  const submit = () => onSave({
    hrMax: hrMaxUnknown ? null : num(hrMax), hrMaxUnknown, age: ageN, hrRest: hrRestUnknown ? null : num(hrRest),
    race: raceDistance && raceTime.trim() ? { distance: raceDistance, time: raceTime } : null,
    weightKg: num(weight), timezone: timezone.trim() || null, weeklyKm: num(weeklyKm), longestRunKm: num(longest), experience: experience || null,
    runDays, longRunDay,
  })
  const ageHint = guess ? 'Ohne HFmax schätzen wir sie: 208 − 0,7 × Alter. Die echte HFmax kann gut 10 Schläge abweichen.' : undefined
  const raceHint = 'Daraus schätzen wir dein Schwellentempo. Ohne Zeit kommen die Trainingstempi aus deiner Zielzeit.'
  const weightHint = 'Nur für die Kohlenhydrat-Mengen vor dem Rennen.'
  const longestHint = 'Von dort wächst dein Longrun, solange Runmate noch keine Läufe von dir kennt.'
  const tzHint = 'Von deinem Browser übernommen; bestimmt, wann für dich „heute“ ist.'
  return (
    <Card title="Dein Profil">
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className={legend}>Puls</legend>
          {/* The checkbox has its own label: inside the field's label a click on its text would focus the field instead. */}
          <div className="grid content-start gap-1.5">
            <Field id="ob-hrmax" label="HFmax (Schläge/min)">
              <Input id="ob-hrmax" inputMode="numeric" className="tabular-nums" value={hrMaxUnknown ? (estimate ? `≈ ${estimate}` : '') : hrMax} disabled={hrMaxUnknown}
                onChange={(e) => setHrMax(e.target.value)} placeholder="z. B. 188" />
            </Field>
            <CheckRow className="text-caption text-muted-foreground" checked={hrMaxUnknown} onChange={(e) => setHrMaxUnknown(e.target.checked)}>
              weiß ich nicht – aus dem Alter schätzen
            </CheckRow>
          </div>
          <Field id="ob-age" label={`Alter${guess ? ' (für die Schätzung)' : ' (optional)'}`} hint={ageHint} className="content-start">
            <Input id="ob-age" inputMode="numeric" className="tabular-nums" value={age} onChange={(e) => setAge(e.target.value)} required={guess}
              aria-describedby={fieldDescribedBy('ob-age', undefined, ageHint)} />
          </Field>
          <div className="grid content-start gap-1.5">
            <Field id="ob-hrrest" label="Ruhepuls">
              <Input id="ob-hrrest" inputMode="numeric" className="tabular-nums" value={hrRestUnknown ? '' : hrRest} disabled={hrRestUnknown} onChange={(e) => setHrRest(e.target.value)} placeholder="morgens im Bett, z. B. 52" />
            </Field>
            <CheckRow className="text-caption text-muted-foreground" checked={hrRestUnknown} onChange={(e) => setHrRestUnknown(e.target.checked)}>
              weiß ich nicht – Beispielwert nutzen (markiert)
            </CheckRow>
          </div>
          <Field id="ob-weight" label="Gewicht in kg (optional)" hint={weightHint} className="content-start">
            <Input id="ob-weight" inputMode="decimal" className="tabular-nums" value={weight} onChange={(e) => setWeight(e.target.value)}
              aria-describedby={fieldDescribedBy('ob-weight', undefined, weightHint)} />
          </Field>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className={legend}>Form</legend>
          <Field id="ob-race" label="Bestzeit oder letztes Rennen (optional)" className="content-start">
            <Select id="ob-race" value={raceDistance} onChange={(e) => setRaceDistance(e.target.value as RaceDistance | '')}>
              <option value="">keins</option>
              {(Object.keys(RACE_LABEL) as RaceDistance[]).map((d) => <option key={d} value={d}>{RACE_LABEL[d]}</option>)}
            </Select>
          </Field>
          <Field id="ob-racetime" label="Zeit" hint={raceHint} className="content-start">
            <Input id="ob-racetime" className="tabular-nums" value={raceTime} onChange={(e) => setRaceTime(e.target.value)} placeholder="h:mm:ss oder mm:ss" disabled={!raceDistance}
              aria-describedby={fieldDescribedBy('ob-racetime', undefined, raceHint)} />
          </Field>
          <Field id="ob-weeklykm" label="Kilometer pro Woche zurzeit" className="content-start">
            <Input id="ob-weeklykm" inputMode="decimal" className="tabular-nums" value={weeklyKm} onChange={(e) => setWeeklyKm(e.target.value)} placeholder="z. B. 35" />
          </Field>
          <Field id="ob-longest" label="Längster Lauf der letzten 4 Wochen (optional)" hint={longestHint} className="content-start">
            <Input id="ob-longest" inputMode="decimal" className="tabular-nums" value={longest} onChange={(e) => setLongest(e.target.value)} placeholder="in km, z. B. 12"
              aria-describedby={fieldDescribedBy('ob-longest', undefined, longestHint)} />
          </Field>
          <Field id="ob-experience" label="Lauferfahrung" className="content-start">
            <Select id="ob-experience" value={experience} onChange={(e) => setExperience(e.target.value as Experience | '')}>
              <option value="">keine Angabe</option>
              {(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((x) => <option key={x} value={x}>{EXPERIENCE_LABEL[x].label} ({EXPERIENCE_LABEL[x].description})</option>)}
            </Select>
          </Field>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className={legend}>Woche</legend>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lauftage">
            {WEEKDAYS.map(({ d, short }) => (
              <ChipButton key={d} selected={runDays.includes(d)} onClick={() => toggle(d)} className="w-11 justify-center">{short}</ChipButton>
            ))}
          </div>
          <Field id="ob-longrunday" label="Longrun am" className="sm:max-w-xs">
            <Select id="ob-longrunday" value={longRunDay} onChange={(e) => setLongRunDay(Number(e.target.value) as Weekday)}>
              {WEEKDAYS.filter((w) => runDays.includes(w.d)).map((w) => <option key={w.d} value={w.d}>{w.long}</option>)}
            </Select>
          </Field>
          <Field id="ob-timezone" label="Zeitzone" hint={tzHint} className="sm:max-w-xs">
            <Input id="ob-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} aria-describedby={fieldDescribedBy('ob-timezone', undefined, tzHint)} />
          </Field>
        </fieldset>
        <Button type="submit" variant="primary" className="w-fit" disabled={busy || !runDays.length}>Speichern und weiter</Button>
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
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-muted-foreground">
        Woher sollen deine Läufe kommen? Verbinde eine Quelle oder lade Dateien hoch (z. B. den Garmin-Export). Mit deinen
        bisherigen Läufen misst Runmate deinen aktuellen Umfang, statt ihn zu schätzen. Das geht auch später in den Einstellungen.
      </p>
      {pull.map((s) => <GarminSource key={s.id} source={s} />)}
      <HealthCard otherRunSource={otherRunSource} />
      <ImportCard />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onNext} disabled={busy}>Weiter</Button>
        <Button onClick={onSkip} disabled={busy}>Überspringen</Button>
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

// One of the two ways into the plan: a large toggle card, brand-tinted when chosen.
function ModeChoice({ selected, onClick, title, children }: { selected: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={cn('rounded-card p-4 text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-brand-soft ring-2 ring-brand' : 'bg-card shadow-raised hover:bg-secondary')}>
      <span className="block text-body-sm font-semibold">{title}</span>
      <span className="mt-1 block text-caption text-muted-foreground">{children}</span>
    </button>
  )
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
  const [longestKm, setLongestKm] = useState(view.athlete?.longestRunKm != null ? String(view.athlete.longestRunKm).replace('.', ',') : '')
  const [preview, setPreview] = useState<DraftResult | null>(null)
  const ctx = useQuery<DraftsCtx>({ queryKey: ['drafts'], queryFn: () => fetch('/api/running/drafts').then((r) => r.json()), enabled: !!goalId })
  const fitting = (ctx.data?.templates ?? []).filter((t) => !t.own && t.distances.includes(GOAL_KINDS.find((k) => k[0] === kind)![2]))
  useEffect(() => { if (fitting.length && !fitting.some((t) => t.id === templateId)) setTemplateId(fitting[0].id) }, [fitting, templateId])
  // Without runs the runner's own numbers start the plan (empty longest run: the profile's, else the mean run of the week).
  const overrides = view.hasRuns ? {} : {
    ...(currentKm.trim() ? { currentKm: Number(currentKm.replace(',', '.')) } : {}),
    ...(longestKm.trim() ? { longest30Km: Number(longestKm.replace(',', '.')) } : {}),
  }
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
  const templateHint = fitting.find((t) => t.id === templateId)?.summary
  const kmHint = 'Noch keine Läufe da – der Plan beginnt bei diesem Umfang.'
  const longestHint = 'Von dort wächst der Longrun, höchstens 10 % auf einmal. Leer: dein Wochenumfang geteilt durch deine Lauftage.'

  if (view.live.length) {
    return (
      <Card title="Dein Plan ist live">
        <p className="text-body-sm">{view.live[0].name}: ab {longDate(view.live[0].planStart)}.</p>
        <Button variant="primary" className="mt-4" onClick={onLive} disabled={busy}>Weiter</Button>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeChoice selected={mode === 'race'} onClick={() => setMode('race')} title="Auf ein Rennen hin">
          Rennen, Zielzeit und Methode wählen; Runmate rechnet den Plan bis zum Renntag.
        </ModeChoice>
        <ModeChoice selected={mode === 'base'} onClick={() => setMode('base')} title="Erstmal ohne Ziel">
          Grundlage: lockere Wochen auf deinem Niveau, eine Schlüsseleinheit, jede vierte Woche leichter.
        </ModeChoice>
      </div>

      {mode === 'base' && (
        <Card title="Grundlage ohne Ziel">
          <p className="text-body-sm text-muted-foreground">
            Ab {longDate(view.nextMonday)} plant Runmate immer vier Wochen voraus: Umfang auf dem Niveau deiner letzten
            Wochen{view.hasRuns ? '' : ` (bis Läufe da sind: ${view.athlete?.weeklyKm ?? 30} km aus deinem Profil)`}, höchstens 5 % mehr pro Woche.
            Sobald du ein Rennen anlegst und einen Plan übernimmst, löst er die Grundlage ab.
          </p>
          <Button variant="primary" className="mt-4" onClick={onBase} disabled={busy}>Grundlage starten</Button>
        </Card>
      )}

      {mode === 'race' && (
        <Card title="Dein Rennen">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveGoal.mutate() }}>
            <Field id="ob-goal-name" label="Name">
              <Input id="ob-goal-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="z. B. Herbst-Halbmarathon" />
            </Field>
            <Field id="ob-goal-date" label="Datum">
              <Input id="ob-goal-date" type="date" className="tabular-nums" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field id="ob-goal-kind" label="Distanz">
              <Select id="ob-goal-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {GOAL_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </Select>
            </Field>
            <Field id="ob-goal-time" label="Zielzeit">
              <Input id="ob-goal-time" className="tabular-nums" value={goalTime} onChange={(e) => setGoalTime(e.target.value)} required placeholder="h:mm oder h:mm:ss" />
            </Field>
            {/* Ink while it is the next step; once saved the plan's own action takes over as the one primary. */}
            <Button type="submit" variant={goalId ? 'secondary' : 'primary'} className="w-fit" disabled={saveGoal.isPending || !!goalId}>{goalId ? 'Gespeichert' : 'Rennen speichern'}</Button>
          </form>
          {goalId && ctx.data && (
            <div className="mt-5 grid gap-3 border-t border-border pt-4">
              <Field id="ob-template" label="Methode" hint={templateHint}>
                <Select id="ob-template" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setPreview(null) }}
                  aria-describedby={fieldDescribedBy('ob-template', undefined, templateHint)}>
                  {fitting.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              {!view.hasRuns && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="ob-current-km" label="Kilometer pro Woche zurzeit" hint={kmHint} className="content-start">
                    <Input id="ob-current-km" inputMode="decimal" className="tabular-nums" value={currentKm} onChange={(e) => { setCurrentKm(e.target.value); setPreview(null) }} required
                      aria-describedby={fieldDescribedBy('ob-current-km', undefined, kmHint)} />
                  </Field>
                  <Field id="ob-longest-km" label="Längster Lauf der letzten 4 Wochen" hint={longestHint} className="content-start">
                    <Input id="ob-longest-km" inputMode="decimal" className="tabular-nums" value={longestKm} onChange={(e) => { setLongestKm(e.target.value); setPreview(null) }} placeholder="in km"
                      aria-describedby={fieldDescribedBy('ob-longest-km', undefined, longestHint)} />
                  </Field>
                </div>
              )}
              <p className="text-caption text-muted-foreground">Start: {longDate(ctx.data.defaultStart)}.</p>
              <Button className="w-fit" onClick={() => makePreview.mutate()} disabled={makePreview.isPending || !templateId}>Entwurf ansehen</Button>
            </div>
          )}
          {preview?.ok && <DraftPreview draft={preview} />}
          {preview?.ok && <Button variant="primary" className="mt-4" onClick={() => goLive.mutate()} disabled={goLive.isPending || busy}>Plan übernehmen</Button>}
          {preview && !preview.ok && <p role="alert" className="mt-3 text-body-sm text-error">{preview.error}</p>}
          {error && <p role="alert" className="mt-3 text-body-sm text-error">{error.message}</p>}
        </Card>
      )}
    </div>
  )
}

function DraftPreview({ draft }: { draft: Extract<DraftResult, { ok: true }> }) {
  const weeks = draft.days.weeks
  const keys = (start: string, end: string) => draft.workouts.sessions.filter((s) => s.date >= start && s.date <= end && s.key).map((s) => s.title)
  const peak = Math.max(...weeks.map((w) => w.km))
  const long = Math.max(0, ...draft.workouts.sessions.filter((s) => s.type === 'long').map((s) => s.km ?? 0))
  const de = (n: number) => String(n).replace('.', ',')
  return (
    <div className="mt-5 grid gap-3 border-t border-border pt-4">
      <p className="text-body-sm tabular-nums">{weeks.length} Wochen, Spitze {de(peak)} km{long ? `, längster Longrun ${de(long)} km` : ''}. Renntempo {fmtPace(draft.paces.racePaceS)}/km, locker {draft.paces.fmt.easy}/km.</p>
      <ul className="grid gap-1.5 text-body-sm">
        {weeks.map((w, i) => (
          <li key={w.start} className="grid grid-cols-[3rem_1fr] gap-2">
            <span className="tabular-nums text-muted-foreground">W{i + 1}</span>
            <span><span className="tabular-nums">{String(w.km).replace('.', ',')} km</span> · {w.focus}{keys(w.start, w.end).length ? ` · ${keys(w.start, w.end).join(', ')}` : ''}</span>
          </li>
        ))}
      </ul>
      {draft.warnings.length > 0 && (
        <ul className="grid gap-1 text-caption text-muted-foreground">{draft.warnings.map((w) => <li key={w.text}>Hinweis ({w.step}): {w.text}</li>)}</ul>
      )}
    </div>
  )
}

// ─── Fertig ───────────────────────────────────────────────────────────────────

function DoneStep({ view, busy, onFinish }: { view: View; busy: boolean; onFinish: () => void }) {
  const e = useEntitlements()
  return (
    <Card title="Fertig">
      <p className="text-body-sm">
        {view.state.goal === 'base' ? `Deine Grundlage beginnt am ${longDate(view.baseStart ?? view.nextMonday)}.`
          : view.live[0] ? `${view.live[0].name}: dein Plan beginnt am ${longDate(view.live[0].planStart)}.` : 'Alles eingerichtet.'}
        {view.state.skipped.includes('source') ? ' Eine Datenquelle verbindest du jederzeit unter Einstellungen → Datenquellen.' : ''}
      </p>
      {e.state === 'trial' && e.trialEndsAt && (
        <p className="mt-2 text-body-sm text-muted-foreground">Deine Testphase läuft bis {format(new Date(e.trialEndsAt * 1000), 'd. MMMM yyyy', { locale: de })} – ohne Zahlungsdaten. Danach geht es kostenlos weiter.</p>
      )}
      <Button variant="primary" className="mt-4" onClick={onFinish} disabled={busy}>Zum Plan</Button>
    </Card>
  )
}
