'use client'

// Training profile onboarding: the 7 steps of runmate-webapp's onboarding (Profil, Ziel, Laufhistorie, Zeitplan, Fitness,
// Verbindungen, Loslegen), adapted to one athlete and prefilled from Runmate's data. The consent step is dropped.
// Once saved, ProfileOverview shows every answer; "Ändern" opens just that step (`only`) instead of the whole flow.
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Check, ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { athlete } from '@/lib/athlete'
import { fmtKm } from '@/lib/plan/format'
import { Button, Card, Figure, Input, Select } from '@/components/ui'
import {
  EXPERIENCE_LABEL, RANGES, WEEKDAYS, inRange, validProfile, type AthleteProfile, type Experience, type RangedField, type Weekday,
} from '@/lib/plan/athlete-profile'
import type { WorkshopEvent } from '@/lib/plan/workshop'

const STEPS = [
  { title: 'Profil', subtitle: 'Ein paar Eckdaten zu dir' },
  { title: 'Ziel', subtitle: 'Worauf du hintrainierst' },
  { title: 'Laufhistorie', subtitle: 'Deine bisherige Erfahrung' },
  { title: 'Zeitplan', subtitle: 'Wann du trainieren kannst' },
  { title: 'Fitness', subtitle: 'Dein aktuelles Niveau' },
  { title: 'Verbindungen', subtitle: 'Woher Runmate seine Daten hat' },
  { title: 'Loslegen', subtitle: 'So entscheidet „Plan anpassen“' },
] as const

const clock = (s: number | null) => (s == null || !Number.isFinite(s) ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
// 'm:ss' → seconds; NaN when typed but not readable (so the step stays blocked instead of silently dropping it).
const parseClock = (t: string) => { if (!t.trim()) return null; const m = t.trim().match(/^(\d{1,2}):([0-5]\d)$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN }

// Label above a control (text-body-sm muted, as before) and a caption line under it.
const labelBox = 'grid gap-1.5 text-body-sm'

// The number fields each step owns; "Weiter" waits until they are empty or in range.
const STEP_FIELDS: Record<number, (p: AthleteProfile) => RangedField[]> = {
  0: () => ['age', 'weightKg', 'heightCm'],
  2: () => ['weeklyKm', 'longestRunKm'],
  3: () => ['maxKmWeekday', 'maxKmWeekend'],
  4: (p) => [p.fitnessMethod === 'fiveK' ? 'fiveKS' : 'thresholdPaceS'],
}

type Connections = { garminSync: string | null; calendar: boolean; appleHealth: boolean }

export function Onboarding({ initial, events, connections, onSave, saving, error, onCancel, only }: {
  initial: AthleteProfile
  events: WorkshopEvent[]
  connections: Connections
  onSave: (p: AthleteProfile) => void
  saving: boolean
  error?: string | null
  onCancel?: () => void
  only?: number   // edit one step of a saved profile: no progress bar, Speichern instead of Weiter
}) {
  const [step, setStep] = useState(only ?? 0)
  const [p, setP] = useState<AthleteProfile>(initial)
  const set = <K extends keyof AthleteProfile>(k: K, v: AthleteProfile[K]) => setP((x) => ({ ...x, [k]: v }))
  const toggle = (k: 'availableDays' | 'qualityDays' | 'kbDays', d: Weekday) =>
    setP((x) => ({ ...x, [k]: x[k].includes(d) ? x[k].filter((y) => y !== d) : [...x[k], d].sort() }))
  const last = step === STEPS.length - 1
  const stepOk = (STEP_FIELDS[step]?.(p) ?? []).every((k) => inRange(k, p[k])) && (step !== 3 || p.availableDays.length > 0)

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div>
        {only == null && (
          <>
            <div className="flex items-center justify-between text-caption text-muted-foreground">
              <span className="tabular-nums">Schritt {step + 1} von {STEPS.length}</span>
              {onCancel && <button onClick={onCancel} className="tap hover:text-foreground">Abbrechen</button>}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
          </>
        )}
        {only != null && <span className="font-mono text-caption uppercase text-muted-foreground">Trainingsprofil</span>}
        <h2 className={cn('text-title-sm', only == null && 'mt-4')}>{STEPS[step].title}</h2>
        <p className="text-body-sm text-muted-foreground">{STEPS[step].subtitle}</p>
      </div>

      <Card>
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Num field="age" label="Alter" unit="Jahre" value={p.age} onChange={(v) => set('age', v)} />
            <Num field="weightKg" label="Gewicht" unit="kg" value={p.weightKg} onChange={(v) => set('weightKg', v)} decimals={1} />
            <Num field="heightCm" label="Größe" unit="cm" value={p.heightCm} onChange={(v) => set('heightCm', v)} />
            <p className="text-caption text-muted-foreground sm:col-span-3">
              HFmax {athlete().hrMax} und die Pulszonen kommen aus Runmates Pulsmodell und bleiben dort. Das Gewicht nutzt Runmate für die Kohlenhydrat-Mengen.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-2 text-body-sm">
            {events.length ? events.slice(0, 4).map((e, i) => (
              <div key={e.date} className={cn('flex flex-wrap items-center justify-between gap-x-3 rounded-card px-3 py-2', i === 0 ? 'ring-1 ring-inset ring-foreground/40' : 'shadow-hairline')}>
                <span className="min-w-0 font-medium">{e.name}</span>
                <span className="text-muted-foreground tabular-nums">{format(parseISO(e.date), 'EEEEEE. d. MMM yyyy', { locale: de })}</span>
              </div>
            )) : <p className="text-muted-foreground">Noch kein Rennen geplant.</p>}
            <p className="mt-1 text-caption text-muted-foreground">
              Ziele und Rennen pflegst du auf der <Link href="/season" className="text-brand-text hover:underline">Saison-Seite</Link>. „Plan anpassen“ lässt alle Renntage unverändert und schaut standardmäßig bis zum nächsten Rennen.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((k) => (
                <Choice key={k} active={p.experience === k} onClick={() => set('experience', k)} label={EXPERIENCE_LABEL[k].label} description={EXPERIENCE_LABEL[k].description} />
              ))}
            </div>
            <Num field="weeklyKm" label="Wochenkilometer zuletzt" unit="km/Woche" value={p.weeklyKm} onChange={(v) => set('weeklyKm', v)}
              hint="Aus deinen Läufen der letzten 4 Wochen vorausgefüllt, sobald welche da sind." />
            <Num field="longestRunKm" label="Längster Lauf der letzten 4 Wochen (optional)" unit="km" value={p.longestRunKm ?? null} onChange={(v) => set('longestRunKm', v)}
              hint="Zählt nur, solange Runmate noch keinen Lauf von dir kennt: von dort wächst dein Longrun." />
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <Days label="An welchen Tagen kannst du laufen?" value={p.availableDays} onToggle={(d) => toggle('availableDays', d)} />
            {p.availableDays.length === 0 && <p className="text-caption text-error">Mindestens ein Tag.</p>}
            <One label="Langer Lauf" value={p.longRunDay} options={p.availableDays} onChange={(d) => set('longRunDay', d)} />
            <Days label="Qualitätstage (Tempo, Intervalle)" value={p.qualityDays} onToggle={(d) => toggle('qualityDays', d)} />
            <Days label="Kettlebell-Tage" value={p.kbDays} onToggle={(d) => toggle('kbDays', d)} />
            <p className="-mt-2 text-caption text-muted-foreground">Nach dem Lauf, 30–40 Min. bei RPE 5–8; ab dem dritten Tag optional (20–30 Min.). Nie in den 2 Tagen vor Longrun-Test oder Rennen, nicht in der Rennwoche.</p>
            <One label="Fester Ruhetag" value={p.restDay} options={WEEKDAYS.map((w) => w.d)} onChange={(d) => set('restDay', d)} allowNone />
            <div className="grid gap-4 sm:grid-cols-2">
              <Num field="maxKmWeekday" label="Höchstens Mo–Fr" unit="km" value={p.maxKmWeekday} onChange={(v) => set('maxKmWeekday', v)} />
              <Num field="maxKmWeekend" label="Höchstens Sa–So" unit="km" value={p.maxKmWeekend} onChange={(v) => set('maxKmWeekend', v)} />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice active={p.fitnessMethod === 'threshold'} onClick={() => set('fitnessMethod', 'threshold')} label="Schwellentempo" description="Tempo, das du ~60 Minuten halten könntest" />
              <Choice active={p.fitnessMethod === 'fiveK'} onClick={() => set('fitnessMethod', 'fiveK')} label="5-km-Zeit" description="Letzte 5 km mit voller Kraft" />
            </div>
            {p.fitnessMethod === 'fiveK' ? (
              <Clock key="fiveK" field="fiveKS" label="5-km-Zeit (mm:ss)" value={p.fiveKS} placeholder="19:30" onChange={(v) => set('fiveKS', v)} />
            ) : (
              <Clock key="threshold" field="thresholdPaceS" label="Schwellentempo (m:ss pro km)" value={p.thresholdPaceS} placeholder="4:08"
                onChange={(v) => set('thresholdPaceS', v)} hint="Vorausgefüllt aus deinem Marathon-Zieltempo (4:23 − 15 s)." />
            )}
          </div>
        )}

        {step === 5 && (
          <ul className="grid gap-2 text-body-sm">
            <Conn ok={!!connections.garminSync} label="Datenquelle" detail={connections.garminSync ? `Letzter Abgleich ${connections.garminSync}` : 'Noch nicht verbunden – in den Einstellungen'} href="/settings#datenquellen" />
            <Conn ok={connections.calendar} label="Apple Kalender" detail={connections.calendar ? 'Abo-Link angelegt' : 'In den Einstellungen anlegen'} href="/settings" />
            <Conn ok={connections.appleHealth} label="Apple Health" detail={connections.appleHealth ? 'Kurzbefehl verbunden' : 'In den Einstellungen verbinden'} href="/settings#datenquellen" />
          </ul>
        )}

        {step === 6 && (
          <div className="grid gap-3 text-body-sm">
            <Summary p={p} />
            <ul className="grid gap-1.5 text-muted-foreground">
              <li>• „Plan anpassen“ schlägt nur vor, nach festen Regeln und mit Zahlen. Nichts ändert sich ohne „Übernehmen“.</li>
              <li>• Jede Änderung lässt sich im Verlauf rückgängig machen.</li>
              <li>• Renntage, feste Termine und vergangene Tage bleiben immer, Taper-Wochen bekommen nie mehr km.</li>
              <li>• Einheiten landen nur auf deinen Lauftagen und nie über deinen Höchst-km.</li>
            </ul>
          </div>
        )}
      </Card>

      {error && <p className="text-body-sm text-error">{error}</p>}
      {only != null ? (
        <div className="flex items-center justify-end gap-2">
          {onCancel && <Button onClick={onCancel}>Abbrechen</Button>}
          <Button variant="primary" onClick={() => onSave(p)} disabled={saving || !stepOk || !validProfile(p)}>
            <Check /> {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      ) : (
      <div className="flex items-center justify-between gap-2">
        <Button onClick={() => setStep(step - 1)} disabled={step === 0}><ChevronLeft /> Zurück</Button>
        {last ? (
          <Button variant="primary" onClick={() => onSave(p)} disabled={saving || !validProfile(p)}>
            <Check /> {saving ? 'Speichert…' : 'Loslegen'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStep(step + 1)} disabled={!stepOk}>
            Weiter <ChevronRight />
          </Button>
        )}
      </div>
      )}
    </div>
  )
}

// Every onboarding answer at a glance, one card per step; onEdit(step) opens that step alone.
export function ProfileOverview({ profile: p, events, connections, onEdit, onBack }: {
  profile: AthleteProfile
  events: WorkshopEvent[]
  connections: Connections
  onEdit: (step: number) => void
  onBack: () => void
}) {
  const unit = (v: number | null, u: string) => (v == null ? '–' : `${fmtKm(v)} ${u}`)
  const section = (step: number, body: ReactNode, opts: { aside?: ReactNode; className?: string } = {}) => (
    <Card className={opts.className}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-body font-semibold">{STEPS[step].title}</h2>
          <p className="text-caption text-muted-foreground">{STEPS[step].subtitle}</p>
        </div>
        {opts.aside ?? (
          <Button size="sm" onClick={() => onEdit(step)}>
            <Pencil /> Ändern
          </Button>
        )}
      </div>
      <div className="text-body-sm">{body}</div>
    </Card>
  )
  const asideLink = (href: string, label: string) => <Link href={href} className="tap shrink-0 text-caption font-medium text-brand-text hover:underline">{label}</Link>
  const big = (label: string, value: ReactNode, sub?: ReactNode) => <Figure label={label} value={value} sub={sub} />
  const fitness = p.fitnessMethod === 'fiveK'
    ? big('5-km-Zeit', clock(p.fiveKS) || '–', 'letzte 5 km mit voller Kraft')
    : big('Schwellentempo', p.thresholdPaceS ? `${clock(p.thresholdPaceS)} /km` : '–', '≈ 60 Minuten haltbar')

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onBack} className="tap text-caption text-muted-foreground hover:text-foreground">← Plan anpassen</button>
          <h1 className="mt-1 text-title">Trainingsprofil</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">Deine Angaben aus dem Onboarding. Jeder Bereich lässt sich einzeln ändern.</p>
        </div>
        {p.savedAt && <span className="text-caption text-muted-foreground">Gespeichert am {format(parseISO(p.savedAt), 'd. MMM yyyy, HH:mm', { locale: de })}</span>}
      </div>

      {/* Layout (12-02): a wide grid of answer cards, each at its natural height (items-start). */}
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {section(0, (
          <div className="grid grid-cols-3 gap-3">
            {big('Alter', p.age ?? '–', 'Jahre')}
            {big('Gewicht', p.weightKg != null ? fmtKm(p.weightKg) : '–', 'kg')}
            {big('HFmax', athlete().hrMax, 'Pulsmodell')}
          </div>
        ))}
        {section(2, (
          <div className="grid grid-cols-2 gap-3">
            {big('Erfahrung', p.experience ? EXPERIENCE_LABEL[p.experience].label : '–', p.experience ? EXPERIENCE_LABEL[p.experience].description : undefined)}
            {big('Zuletzt', unit(p.weeklyKm, 'km'), 'pro Woche')}
          </div>
        ))}
        {section(4, fitness, { className: 'sm:col-span-2 lg:col-span-1' })}
      </div>

      {section(3, <WeekStrip p={p} />)}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {section(1, events.length ? (
          <ul className="grid gap-1.5">
            {events.slice(0, 4).map((e, i) => (
              <li key={e.date} className={cn('flex items-center justify-between gap-3 rounded-card px-3 py-2', i === 0 ? 'ring-1 ring-inset ring-foreground/40' : 'shadow-hairline')}>
                <span className="min-w-0 truncate font-medium">{e.name}</span>
                <span className="shrink-0 text-caption text-muted-foreground tabular-nums">{format(parseISO(e.date), 'EEEEEE. d. MMM yyyy', { locale: de })}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted-foreground">Noch kein Rennen geplant.</p>, { aside: asideLink('/season', 'Saison-Seite') })}
        {section(5, (
          <ul className="grid gap-2">
            <Conn ok={!!connections.garminSync} label="Datenquelle" detail={connections.garminSync ? `Letzter Abgleich ${connections.garminSync}` : 'Noch nicht verbunden – in den Einstellungen'} href="/settings#datenquellen" />
            <Conn ok={connections.calendar} label="Apple Kalender" detail={connections.calendar ? 'Abo-Link angelegt' : 'In den Einstellungen anlegen'} href="/settings" />
            <Conn ok={connections.appleHealth} label="Apple Health" detail={connections.appleHealth ? 'Kurzbefehl verbunden' : 'In den Einstellungen verbinden'} href="/settings#datenquellen" />
          </ul>
        ), { aside: asideLink('/settings', 'Einstellungen') })}
      </div>
    </div>
  )
}

// The week at a glance: what each weekday is for, plus the km limits.
function WeekStrip({ p }: { p: AthleteProfile }) {
  const role = (d: Weekday) => d === p.longRunDay ? { label: 'Longrun', tone: 'bg-warning-soft text-warning' }
    : p.qualityDays.includes(d) && p.availableDays.includes(d) ? { label: 'Qualität', tone: 'bg-brand-soft text-brand-text' }
    : d === p.restDay ? { label: 'Ruhetag', tone: 'bg-secondary text-muted-foreground' }
    : p.availableDays.includes(d) ? { label: 'Lauf', tone: 'bg-teal-soft text-teal-text' }
    : { label: 'frei', tone: 'border border-dashed border-border bg-background text-muted-foreground' }
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {WEEKDAYS.map((w) => {
          const r = role(w.d)
          return (
            <div key={w.d} className={cn('flex min-w-0 flex-col items-center gap-1 rounded-card px-0.5 py-2 sm:px-1 sm:py-3', r.tone)}>
              <span className="text-caption font-semibold">{w.short}</span>
              <span className="w-full truncate text-center text-caption">{r.label}</span>
              <span className={cn('rounded-control px-1 text-caption font-medium', p.kbDays.includes(w.d) ? 'bg-foreground text-background' : 'invisible')}>KB</span>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-muted-foreground">
        <span>Höchstens <b className="font-medium text-foreground tabular-nums">{p.maxKmWeekday ?? '–'} km</b> Mo–Fr</span>
        <span>Höchstens <b className="font-medium text-foreground tabular-nums">{p.maxKmWeekend ?? '–'} km</b> Sa–So</span>
        <span>KB = Kettlebell</span>
      </div>
    </div>
  )
}

// Keeps what is typed (German comma allowed) and only reports it; the range is checked by the step, not while typing.
export function Num({ field, label, unit, value, onChange, decimals = 0, hint }: {
  field: RangedField; label: string; unit: string; value: number | null; onChange: (v: number | null) => void; decimals?: number; hint?: string
}) {
  const [t, setT] = useState(value == null ? '' : String(value).replace('.', ','))
  const [lo, hi] = RANGES[field]
  const bad = !inRange(field, value)
  return (
    <label className={labelBox}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <Input inputMode={decimals ? 'decimal' : 'numeric'} className="tabular-nums" value={t} placeholder="–" aria-invalid={bad}
          onChange={(e) => {
            setT(e.target.value)
            const s = e.target.value.trim().replace(',', '.')
            const n = s ? Number(s) : null
            onChange(n == null ? null : Number.isFinite(n) ? Number(n.toFixed(decimals)) : NaN)
          }} />
        <span className="shrink-0 text-caption text-muted-foreground">{unit}</span>
      </span>
      {bad ? <span className="text-caption text-error">Bitte {lo}–{hi} {unit} oder leer lassen.</span>
        : hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Clock({ field, label, value, onChange, placeholder, hint }: {
  field: RangedField; label: string; value: number | null; onChange: (v: number | null) => void; placeholder: string; hint?: string
}) {
  const [t, setT] = useState(clock(value))
  const [lo, hi] = RANGES[field]
  const bad = !inRange(field, value)
  return (
    <label className={labelBox}>
      <span className="text-muted-foreground">{label}</span>
      <Input className="tabular-nums" value={t} placeholder={placeholder} aria-invalid={bad}
        onChange={(e) => { setT(e.target.value); onChange(parseClock(e.target.value)) }} />
      {bad ? <span className="text-caption text-error">Bitte als m:ss, zwischen {clock(lo)} und {clock(hi)}.</span>
        : hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Choice({ active, onClick, label, description }: { active: boolean; onClick: () => void; label: string; description: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cn('rounded-card px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-secondary ring-1 ring-inset ring-foreground' : 'bg-card shadow-hairline hover:bg-secondary')}>
      <span className="block text-body-sm font-medium">{label}</span>
      <span className="block text-caption text-muted-foreground">{description}</span>
    </button>
  )
}

export function Days({ label, value, onToggle }: { label: string; value: Weekday[]; onToggle: (d: Weekday) => void }) {
  return (
    <div className={labelBox}>
      <span className="text-muted-foreground">{label}</span>
      <div className="grid max-w-[21.5rem] grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <button key={w.d} type="button" onClick={() => onToggle(w.d)} aria-pressed={value.includes(w.d)} aria-label={w.long}
            className={cn('tap h-9 rounded-control text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              value.includes(w.d) ? 'bg-foreground text-background' : 'bg-card text-foreground shadow-hairline hover:bg-secondary')}>
            {w.short}
          </button>
        ))}
      </div>
    </div>
  )
}

export function One({ label, value, options, onChange, allowNone }: { label: string; value: Weekday | null; options: Weekday[]; onChange: (d: Weekday | null) => void; allowNone?: boolean }) {
  return (
    <label className={labelBox}>
      <span className="text-muted-foreground">{label}</span>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? (Number(e.target.value) as Weekday) : null)}>
        {allowNone && <option value="">keiner</option>}
        {WEEKDAYS.filter((w) => options.includes(w.d)).map((w) => <option key={w.d} value={w.d}>{w.long}</option>)}
      </Select>
    </label>
  )
}

function Conn({ ok, label, detail, href }: { ok: boolean; label: string; detail: string; href?: string }) {
  const body = (
    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-card px-3 py-2 shadow-hairline">
      <span className="flex items-center gap-2"><span className={cn('h-2 w-2 shrink-0 rounded-full', ok ? 'bg-teal' : 'bg-muted-foreground/40')} />{label}</span>
      <span className="text-caption text-muted-foreground">{detail}</span>
    </span>
  )
  return <li>{href && !ok ? <Link href={href}>{body}</Link> : body}</li>
}

const days = (ds: Weekday[]) => ds.length ? ds.map((d) => WEEKDAYS[d - 1].short).join(', ') : '–'
const scheduleRows = (p: AthleteProfile): [string, string][] => [
  ['Lauftage', days(p.availableDays)],
  ['Langer Lauf', p.longRunDay ? WEEKDAYS[p.longRunDay - 1].long : '–'],
  ['Qualität', days(p.qualityDays)],
  ['Kettlebell', days(p.kbDays)],
  ['Ruhetag', p.restDay ? WEEKDAYS[p.restDay - 1].long : 'keiner'],
  ['Höchst-km', `${p.maxKmWeekday ?? '–'} (Mo–Fr) · ${p.maxKmWeekend ?? '–'} (Sa–So)`],
]
const fitnessRow = (p: AthleteProfile): [string, string] =>
  ['Fitness', p.fitnessMethod === 'fiveK' ? `5 km in ${clock(p.fiveKS) || '–'}` : `Schwelle ${clock(p.thresholdPaceS) || '–'}/km`]

function Summary({ p }: { p: AthleteProfile }) {
  return <Rows rows={[...scheduleRows(p), fitnessRow(p)]} />
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.flatMap(([k, v]) => [<dt key={`k${k}`} className="text-muted-foreground">{k}</dt>, <dd key={`v${k}`} className="tabular-nums">{v}</dd>])}
    </dl>
  )
}
