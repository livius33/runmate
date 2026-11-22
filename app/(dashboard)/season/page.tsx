'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { addDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Flag, Pencil, Plus } from 'lucide-react'
import { useToday } from '@/lib/use-today'
import { cn } from '@/lib/utils'
import { Button, Card, Chip, Input, Inset, Select } from '@/components/ui'
import { PlanAction, PlanStatePill, usePlanStatus } from '@/components/plan/NextPlan'
import type { GoalPlanStatus } from '@/lib/plan/draft-store'
import { blockFor, blocks } from '@/lib/plan/blocks'
import { fmtKm, fmtPace } from '@/lib/plan/format'
import { ROLE_LABEL, defaultRole, eventBlock, eventEffect, eventError, eventRules, eventWarning, roleOf } from '@/lib/plan/events'
import {
  DEFAULT_PRIORITY, KINDS, KIND_LABEL, PRIORITY_LABEL, allGoals, clockText, distanceOf, goalText, isShort, parseClock,
  seasonTimeline, storedGoals, type BlockItem, type EventRole, type GoalItem, type GoalKind, type Priority, type SeasonGoal,
} from '@/lib/season/goals'

const dateLabel = (d: string) => format(parseISO(d), 'EEEEEE. d. MMMM yyyy', { locale: de })
const shortDate = (d: string) => format(parseISO(d), 'EEEEEE. d.M.', { locale: de })

function countdown(daysLeft: number) {
  if (daysLeft < 0) return 'gelaufen'
  if (daysLeft === 0) return 'heute'
  return daysLeft > 56 ? `in ${Math.round(daysLeft / 7)} Wochen` : `in ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tagen'}`
}

type Edit = { mode: 'new' } | { mode: 'edit'; id: string } | null

export default function SeasonPage() {
  const today = useToday()
  const qc = useQueryClient()
  const router = useRouter()
  const { data: goals = allGoals(storedGoals(null)) } = useQuery<SeasonGoal[]>({
    queryKey: ['season'],
    queryFn: () => fetch('/api/season').then((r) => r.json()).then((d) => d.goals),
  })
  const plans = usePlanStatus()
  const [edit, setEdit] = useState<Edit>(null)

  const save = useMutation({
    mutationFn: async (goal: Omit<SeasonGoal, 'id'> & { id?: string }) => {
      const r = await fetch('/api/season', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error ?? 'Speichern fehlgeschlagen')
      return data.goals as SeasonGoal[]
    },
    onSuccess: (next) => changed(next),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/season?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error ?? 'Löschen fehlgeschlagen')
      return data.goals as SeasonGoal[]
    },
    onSuccess: (next) => changed(next),
  })
  // A minor race changes the plan: the layout re-registers the blocks, plan data is fetched again.
  function changed(next: SeasonGoal[]) {
    qc.setQueryData(['season'], next)
    setEdit(null)
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'season' })
    router.refresh()
  }

  const open = (e: Edit) => { save.reset(); remove.reset(); setEdit(e) }
  const error = save.isError ? (save.error as Error).message : remove.isError ? (remove.error as Error).message : null
  const formProps = {
    onCancel: () => setEdit(null), onSave: (g: Omit<SeasonGoal, 'id'> & { id?: string }) => save.mutate(g),
    onDelete: (id: string) => remove.mutate(id), busy: save.isPending || remove.isPending, error, today,
  }
  const card = (item: GoalItem) => (
    <GoalCard item={item} plan={plans.data?.status.find((s) => s.goalId === item.goal.id)} editing={edit?.mode === 'edit' && edit.id === item.goal.id} onEdit={() => open({ mode: 'edit', id: item.goal.id })} form={formProps} />
  )
  const items = seasonTimeline(goals, today)

  // Layout (12-02): title row full width. From lg up the timeline takes the wide left column (8 / 12) and the base
  // block card sits beside it at its natural height; on phones the base block follows the timeline as before.
  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Title row: from sm up the action sits on the title's baseline; on phones it follows the intro line. */}
      <div className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline">
        <h1 className="min-w-0 text-title">Saison</h1>
        <p className="max-w-3xl text-body-sm text-muted-foreground sm:col-start-1">
          Deine Rennen und Läufe. Hauptrennen bekommen einen Aufbaublock, Nebenrennen und Läufe stehen im Block, in den sie fallen.
        </p>
        {edit?.mode !== 'new' && (
          <Button variant="primary" className="mt-2 justify-self-start sm:col-start-2 sm:row-start-1 sm:mt-0" onClick={() => open({ mode: 'new' })}>
            <Plus /> Rennen oder Lauf hinzufügen
          </Button>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-8">
          {edit?.mode === 'new' && (
            <Card title="Neues Rennen oder neuer Lauf"><GoalForm {...formProps} /></Card>
          )}

          <ol className="flex flex-col gap-3">
            {items.map((item) => item.type === 'goal'
              ? <li key={item.goal.id}>{card(item)}</li>
              : <li key={`${item.from.id}-${item.to.id}`}><BlockRow item={item} card={card} /></li>)}
          </ol>
        </div>

        <div className="min-w-0 lg:col-span-4">
          <BaseBlockCard onChange={() => { qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'season' && q.queryKey[0] !== 'base-block' }); router.refresh() }} />
        </div>
      </div>
    </div>
  )
}

// Rolling base block (07-17): the base weeks between goal blocks, a pause switch and an own weekly cap.
type BaseState = { settings: { v: 1; paused: boolean; capKm: number | null }; weeks: { kw: number; start: string; km: number; focus: string; cutback?: boolean }[] }
function BaseBlockCard({ onChange }: { onChange: () => void }) {
  const qc = useQueryClient()
  const q = useQuery<BaseState>({ queryKey: ['base-block'], queryFn: () => fetch('/api/running/base-block').then((r) => r.json()) })
  const [cap, setCap] = useState<string | null>(null)
  const put = useMutation({
    mutationFn: async (body: { paused?: boolean; capKm?: number | null }) => {
      const r = await fetch('/api/running/base-block', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Speichern fehlgeschlagen')
      return d as BaseState
    },
    onSuccess: (d) => { qc.setQueryData(['base-block'], d); setCap(null); onChange() },
  })
  if (!q.data) return null
  const { settings: st, weeks } = q.data
  const capText = cap ?? (st.capKm != null ? String(st.capKm) : '')
  return (
    <Card title="Grundlage zwischen den Blöcken" aside={
      <Button size="sm" onClick={() => put.mutate({ paused: !st.paused })} disabled={put.isPending}>{st.paused ? 'Fortsetzen' : 'Pausieren'}</Button>}>
      <div className="grid gap-3 text-body-sm">
        <p className="text-muted-foreground">{st.paused
          ? 'Pausiert: zwischen den Blöcken steht kein Plan.'
          : 'Wo kein Zielblock plant, plant Runmate Grundlage: Umfang der letzten Wochen, höchstens 5 % mehr pro Woche bis zu deinem gehaltenen Umfang, eine Schlüsseleinheit, jede vierte Woche leichter. Immer 4 Wochen voraus.'}</p>
        {!st.paused && (weeks.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {weeks.map((w) => (
              <div key={w.start} className={cn('rounded-card px-3 py-2', w.cutback ? 'bg-secondary' : 'shadow-hairline')}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="font-medium tabular-nums">KW {w.kw}</span><span className="tabular-nums">{fmtKm(w.km)} km</span></div>
                <div className="text-caption text-muted-foreground">{w.cutback ? 'leichtere Woche' : w.focus.replace(/ \([^)]*\)$/, '')}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-caption text-muted-foreground">Gerade keine Lücke: die Zielblöcke schließen aneinander an.</p>)}
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Höchstens</span>
          <Input inputMode="numeric" value={capText} onChange={(e) => setCap(e.target.value)} placeholder="gehaltener Umfang"
            className="w-36 tabular-nums" />
          <span className="text-caption text-muted-foreground">km pro Woche</span>
          <Button size="action" onClick={() => put.mutate({ capKm: capText.trim() ? Number(capText.trim().replace(',', '.')) : null })} disabled={cap == null || put.isPending}>Speichern</Button>
        </label>
        {put.isError && <p className="text-caption text-error">{(put.error as Error).message}</p>}
      </div>
    </Card>
  )
}

type FormProps = {
  onCancel: () => void
  onSave: (g: Omit<SeasonGoal, 'id'> & { id?: string }) => void
  onDelete: (id: string) => void
  busy: boolean
  error: string | null
  today: string
}

function GoalCard({ item, plan, editing, onEdit, form }: { item: GoalItem; plan?: GoalPlanStatus; editing: boolean; onEdit: () => void; form: FormProps }) {
  const g = item.goal
  const minor = g.priority === 'B'
  const block = eventBlock(g, blocks())
  const role = block && !eventError(g, block) ? roleOf(g, block) : null
  return (
    <Card className={cn(item.current && 'border-l-4 border-l-brand', minor && 'p-3 sm:p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Flag className={cn('h-4 w-4 shrink-0', minor ? 'text-muted-foreground' : 'text-brand')} />
            <h2 className={cn('min-w-0 font-semibold', minor ? 'text-body-sm' : 'text-body')}>{g.name}</h2>
            <Chip>{KIND_LABEL[g.kind]}</Chip>
            {minor && <Chip>{PRIORITY_LABEL.B}</Chip>}
            {role && <Chip tone="brand">{ROLE_LABEL[role]}</Chip>}
            {item.current && <Chip tone="brand">Jetzt</Chip>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm">
            <span>{dateLabel(g.date)}</span>
            <Chip tone={g.confirmed ? 'teal' : 'warning'}>{g.confirmed ? 'bestätigt' : 'Platzhalter'}</Chip>
          </div>
          <div className="mt-1.5 text-body-sm text-muted-foreground">
            Ziel <b className="font-medium text-foreground tabular-nums">{goalText(g)}</b>
            {g.kind === 'backyard' && <span> · Runden à 6,706 km, jede volle Stunde</span>}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className={cn('font-semibold tabular-nums', minor ? 'text-body' : 'text-title-sm')}>{countdown(item.daysLeft)}</div>
          {g.fromPlan && g.priority === 'A'
            ? <Link href="/race" className="tap mt-1 inline-block text-caption font-medium text-brand-text hover:underline">Renntag →</Link>
            : g.fromPlan
              ? <span className="mt-1 inline-block text-caption text-muted-foreground">im Trainingsplan</span>
              : !editing && !item.done && (
                  <button onClick={onEdit} className="tap mt-1 inline-flex items-center gap-1 text-caption font-medium text-brand-text hover:underline">
                    <Pencil className="h-3 w-3" /> Bearbeiten
                  </button>
                )}
        </div>
      </div>
      {plan && ['marathon', 'half', '10k'].includes(g.kind) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="flex items-center gap-2 text-caption text-muted-foreground">Trainingsplan <PlanStatePill state={plan.state} /></span>
          <PlanAction status={plan} />
        </div>
      )}
      {editing && <div className="mt-4 border-t border-border pt-4"><GoalForm goal={g} {...form} /></div>}
    </Card>
  )
}

function GoalForm({ goal, onCancel, onSave, onDelete, busy, error, today }: FormProps & { goal?: SeasonGoal }) {
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? '10k')
  const [priority, setPriority] = useState<Priority>(goal?.priority ?? DEFAULT_PRIORITY['10k'])
  const [name, setName] = useState(goal?.name ?? '')
  const [date, setDate] = useState(goal?.date ?? format(addDays(parseISO(today), 28), 'yyyy-MM-dd'))
  const [confirmed, setConfirmed] = useState(goal?.confirmed ?? false)
  const [distance, setDistance] = useState(goal?.distanceKm?.toString().replace('.', ',') ?? '')
  const [target, setTarget] = useState(goal ? (goal.kind === 'backyard' ? (goal.loops?.toString() ?? '') : clockText(goal.goalS)) : '')
  const [local, setLocal] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [role, setRole] = useState<EventRole | ''>(goal?.role ?? '')     // '' = the suggested default
  const [pace, setPace] = useState(goal?.paceS != null ? fmtPace(goal.paceS) : '')
  const backyard = kind === 'backyard'

  // Minor race inside a generated block (07-16): role, what it does, test pace. Hand-written block: shown here only.
  const km = kind === 'other' ? Number(distance.replace(',', '.')) || null : distanceOf({ kind } as SeasonGoal)
  const draft = { id: goal?.id ?? 'new', kind, priority, name, date, confirmed, distanceKm: km, goalS: null, loops: null } as SeasonGoal
  const block = eventBlock(draft, blocks())
  const fixedBlock = priority === 'B' && !block ? blockFor(date) : null
  const handWritten = !!fixedBlock?.handWritten
  const suggested = block ? defaultRole(draft, block) : null
  const chosen = role || suggested
  const blockError = block ? eventError(draft, block) : null
  const warning = block ? eventWarning(draft, block) : null
  const goalPace = block ? fmtPace(block.race.goalPaceS) : ''

  function changeKind(k: GoalKind) {
    setKind(k)
    if (!goal) setPriority(DEFAULT_PRIORITY[k])
    setTarget('')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = target.trim()
    let goalS: number | null = null, loops: number | null = null, distanceKm: number | null = null
    if (kind === 'other') {
      distanceKm = Number(distance.replace(',', '.'))
      if (!distance.trim() || !Number.isFinite(distanceKm)) { setLocal('Bitte die Strecke in km angeben (1 bis 250).'); return }
    }
    if (t) {
      if (backyard) {
        loops = Number(t)
        if (!Number.isInteger(loops)) { setLocal('Runden: eine ganze Zahl von 1 bis 100.'); return }
      } else {
        goalS = parseClock(t, isShort(kind))
        if (goalS == null) { setLocal(isShort(kind) ? 'Zielzeit als mm:ss eingeben, z. B. 38:30.' : 'Zielzeit als h:mm:ss eingeben, z. B. 1:24:30.'); return }
      }
    }
    let paceS: number | null = null
    if (block && chosen === 'test' && pace.trim() && pace.trim() !== goalPace) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(pace.trim())
      paceS = m ? Number(m[1]) * 60 + Number(m[2]) : NaN
      if (!m || Number(m[2]) > 59) { setLocal('Testtempo als m:ss pro km eingeben, z. B. 4:23.'); return }
    }
    setLocal(null)
    onSave({
      id: goal?.id, kind, priority, name: name.trim() || KIND_LABEL[kind], date, confirmed, distanceKm, goalS, loops,
      ...(block && role ? { role } : {}), ...(paceS != null ? { paceS } : {}),
    })
  }

  // Labels wrap their control (no ids needed).
  const field = 'grid gap-1.5 text-body-sm font-medium'
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className={field}>Art
        <Select className="font-normal" value={kind} onChange={(e) => changeKind(e.target.value as GoalKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </Select>
      </label>
      <label className={field}>Bedeutung
        <Select className="font-normal" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {(['A', 'B'] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </Select>
      </label>
      <label className={field}>Name
        <Input className="font-normal" value={name} maxLength={40} placeholder={KIND_LABEL[kind]} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={field}>Datum
        <Input type="date" className="font-normal" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {kind === 'other' && (
        <label className={field}>Strecke in km
          <Input className="font-normal tabular-nums" inputMode="decimal" placeholder="z. B. 15" value={distance} onChange={(e) => setDistance(e.target.value)} />
        </label>
      )}
      <label className={field}>
        {backyard ? 'Ziel: Runden (leer = offen)' : `Zielzeit ${isShort(kind) ? 'mm:ss' : 'h:mm:ss'} (leer = offen)`}
        <Input className="font-normal tabular-nums" inputMode={backyard ? 'numeric' : 'text'}
          placeholder={backyard ? 'z. B. 24' : isShort(kind) ? 'z. B. 38:30' : 'z. B. 1:24:30'} value={target} onChange={(e) => setTarget(e.target.value)} />
      </label>
      <label className="flex min-h-10 items-center gap-2 self-end text-body-sm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--brand))]" />
        Gebucht (bestätigt)
      </label>
      {block && (
        <Inset className="grid gap-3 p-3 sm:col-span-2 sm:grid-cols-2">
          <label className={field}>Rolle im Plan ({block.race.name})
            <Select className="font-normal" value={role} onChange={(e) => setRole(e.target.value as EventRole | '')}>
              <option value="">Vorschlag: {ROLE_LABEL[suggested!]}</option>
              {(['test', 'build', 'fun'] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </label>
          {chosen === 'test' && (
            <label className={field}>Testtempo /km (leer = Zieltempo {goalPace})
              <Input className="font-normal tabular-nums" placeholder={goalPace} value={pace} onChange={(e) => setPace(e.target.value)} />
            </label>
          )}
          <p className="text-caption text-muted-foreground sm:col-span-2">
            {blockError ?? (km ? eventEffect(chosen!, km, eventRules(block)) : 'Für die Planung braucht das Rennen eine Strecke.')}
          </p>
          {warning && !blockError && (
            <p className="flex items-center gap-1.5 text-caption text-warning sm:col-span-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{warning}</p>
          )}
        </Inset>
      )}
      {handWritten && (
        <p className="text-caption text-muted-foreground sm:col-span-2">{fixedBlock!.race.shortName}-Block bleibt unverändert: das Rennen steht nur hier in der Saison, nicht im Plan.</p>
      )}
      {priority === 'A' && (
        <p className="text-caption text-muted-foreground sm:col-span-2">Hauptrennen bekommen einen eigenen Aufbaublock.</p>
      )}
      {(local ?? error) && (
        <p className="flex items-center gap-1.5 text-body-sm text-error sm:col-span-2"><AlertTriangle className="h-4 w-4 shrink-0" />{local ?? error}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Speichert …' : goal ? 'Speichern' : 'Hinzufügen'}
        </Button>
        <Button onClick={onCancel}>Abbrechen</Button>
        {goal && (confirmDelete
          ? <span className="ml-auto flex flex-wrap items-center gap-2 text-body-sm">
              Wirklich löschen?
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => onDelete(goal.id)}>Ja, löschen</Button>
              <Button size="sm" onClick={() => setConfirmDelete(false)}>Nein</Button>
            </span>
          : <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="ml-auto">Löschen</Button>)}
      </div>
    </form>
  )
}

function BlockRow({ item, card }: { item: BlockItem; card: (g: GoalItem) => React.ReactNode }) {
  return (
    <div className={cn('ml-5 border-l-2 py-2 pl-5 text-body-sm', item.current ? 'border-brand' : 'border-border')}>
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        {item.current && <Chip tone="brand">Jetzt</Chip>}
        <span>Erholung bis {shortDate(item.recoveryEnd)}</span>
        <span>·</span>
        <span className="font-medium text-foreground">{item.buildWeeks} Wochen Aufbau</span>
        <span>bis {item.to.name}</span>
      </div>
      {item.short && (
        <p className="mt-1 flex items-center gap-1.5 text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Kurzer Aufbau für {KIND_LABEL[item.to.kind]}: lieber ein späteres Rennen wählen.
        </p>
      )}
      {item.events.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2">{item.events.map((e) => <li key={e.goal.id}>{card(e)}</li>)}</ol>
      )}
    </div>
  )
}
