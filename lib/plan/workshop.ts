// Plan-Werkstatt: review a chosen period of the plan and suggest changes by fixed rules. Pure.
// Nothing here writes: suggestions are applied as manual edits by the API after the runner confirms.
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'
import { type PlanSession } from './types'
import { fmtKm } from './format'
import { allWeeks, blocks, isEasyWeek, weekOf } from './blocks'
import {
  balanceWeek, canTakeExtra, dayLabel, dayState, isHard, join, weekSummary,
  type ActualKm, type Overrides,
} from './effective'
import { testWindow, tired, type Fitness } from './engine'
import { fitSession } from './structure'
import { dayAvailable, isoDay, profileMaxKm, type AthleteProfile } from './athlete-profile'
import { acwrStreak, acwrWhy, recoveryRedWhy, rulesFor } from './rules'
import { inPauseWindow, type PauseInput } from './pause'
import { feedbackHints, feedbackSignals, type FeedbackHint, type FeedbackInput } from '@/lib/feedback/rules'

// ─── Period ───────────────────────────────────────────────────────────────────

export type PeriodChoice =
  | { kind: 'event' }
  | { kind: 'weeks'; weeks: number }
  | { kind: 'range'; from: string; to: string }

export interface WorkshopEvent { date: string; name: string }
export interface Period { from: string; to: string; label: string; event?: WorkshopEvent }

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const monday = (date: string) => iso(startOfWeek(parseISO(date), { weekStartsOn: 1 }))
const plusDays = (date: string, n: number) => iso(addDays(parseISO(date), n))
const r1 = (n: number) => Math.round(n * 10) / 10
const half = (n: number) => Math.round(n * 2) / 2
const MAX_DAYS = 26 * 7

// The period always starts on the Monday of a week, so whole weeks are reviewed (past days included).
export function periodFor(choice: PeriodChoice, today: string, events: WorkshopEvent[]): Period {
  const from = monday(today)
  if (choice.kind === 'event') {
    const next = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
    if (next) return { from, to: next.date, label: `Bis ${next.name}`, event: next }
    return periodFor({ kind: 'weeks', weeks: 4 }, today, events)
  }
  if (choice.kind === 'weeks') {
    const w = Math.min(26, Math.max(1, Math.round(choice.weeks)))
    return { from, to: plusDays(from, 7 * w - 1), label: `${w} Wochen` }
  }
  const a = choice.from <= choice.to ? choice.from : choice.to
  const b = choice.from <= choice.to ? choice.to : choice.from
  const to = differenceInCalendarDays(parseISO(b), parseISO(a)) > MAX_DAYS ? plusDays(a, MAX_DAYS) : b
  return { from: a, to, label: `${format(parseISO(a), 'd.M.')}–${format(parseISO(to), 'd.M.yyyy')}` }
}

export function datesOf(p: Period) {
  const out: string[] = []
  for (let d = p.from; d <= p.to; d = plusDays(d, 1)) out.push(d)
  return out
}

// ─── Review ───────────────────────────────────────────────────────────────────

export interface WeekReview {
  start: string; end: string; kw: number | null; focus: string | null; taper: boolean
  targetKm: number | null; plannedKm: number; runKm: number; remainingKm: number; missedKm: number; extraKm: number
}

export interface PeriodReview {
  weeks: WeekReview[]
  totals: { plannedKm: number; runKm: number; remainingKm: number; missedKm: number; extraKm: number }
  key: { done: number; open: number; missed: number }
  fitness: Fitness
  recent: RecentVolume | null
}

export interface RecentVolume { weeks: number; plannedKm: number; runKm: number; ratio: number }

export function reviewPeriod(p: Period, today: string, sessions: PlanSession[], actual: ActualKm, fitness: Fitness, recent: RecentVolume | null): PeriodReview {
  const weeks: WeekReview[] = []
  for (let start = monday(p.from); start <= p.to; start = plusDays(start, 7)) {
    const end = plusDays(start, 6)
    const days = Array.from({ length: 7 }, (_, i) => plusDays(start, i)).filter((d) => d >= p.from && d <= p.to)
      .map((d) => dayState(d, today, sessions, actual))
    const pw = weekOf(start)
    const raceFree = days.filter((d) => d.session?.type !== 'race')
    weeks.push({
      start, end, kw: pw?.kw ?? null, focus: pw?.focus ?? null, taper: !!pw?.taper, targetKm: pw?.km ?? null,
      plannedKm: r1(raceFree.reduce((t, d) => t + d.plannedKm, 0)),
      runKm: r1(raceFree.reduce((t, d) => t + d.actualKm, 0)),
      remainingKm: r1(raceFree.filter((d) => d.date >= today && d.actualKm === 0).reduce((t, d) => t + d.plannedKm, 0)),
      missedKm: r1(raceFree.filter((d) => d.date < today).reduce((t, d) => t + d.openKm, 0)),
      extraKm: r1(raceFree.reduce((t, d) => t + (d.status === 'extra' ? d.actualKm : Math.max(0, d.actualKm - d.plannedKm)), 0)),
    })
  }
  const sum = (k: keyof WeekReview) => r1(weeks.reduce((t, w) => t + (w[k] as number), 0))
  const keyDays = datesOf(p).map((d) => dayState(d, today, sessions, actual)).filter((d) => d.session?.key || isHard(d.session))
  return {
    weeks,
    totals: { plannedKm: sum('plannedKm'), runKm: sum('runKm'), remainingKm: sum('remainingKm'), missedKm: sum('missedKm'), extraKm: sum('extraKm') },
    key: {
      done: keyDays.filter((d) => d.status === 'done' || d.status === 'partial').length,
      open: keyDays.filter((d) => d.status === 'planned').length,
      missed: keyDays.filter((d) => d.status === 'missed').length,
    },
    fitness, recent,
  }
}

// Volume of the last `n` complete weeks before today's week: planned vs. run.
export function recentVolume(today: string, sessions: PlanSession[], actual: ActualKm, n = 3): RecentVolume | null {
  let planned = 0, run = 0, weeks = 0
  for (let i = 1; i <= n; i++) {
    const start = plusDays(monday(today), -7 * i)
    const dates = Array.from({ length: 7 }, (_, k) => plusDays(start, k))
    const p = dates.reduce((t, d) => { const s = sessions.find((x) => x.date === d); return t + (s && s.type !== 'race' && s.type !== 'rest' ? s.km ?? 0 : 0) }, 0)
    if (p <= 0) continue
    planned += p
    // Race days count neither as planned nor as run (the marathon's km would inflate the ratio).
    run += dates.filter((d) => sessions.find((x) => x.date === d)?.type !== 'race').reduce((t, d) => t + (actual.get(d) ?? 0), 0)
    weeks++
  }
  if (!weeks) return null
  return { weeks, plannedKm: r1(planned), runKm: r1(run), ratio: Math.round((run / planned) * 100) / 100 }
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

export type SuggestionKind = 'missed-km' | 'volume-down' | 'volume-up' | 'fatigue' | 'key-catchup' | 'feedback-fatigue'

export interface DiffRow { date: string; before: PlanSession | null; after: PlanSession }
export interface Suggestion {
  id: string
  kind: SuggestionKind
  title: string
  why: string[]
  changes: Overrides
  diff: DiffRow[]
  weekKm: { start: string; before: number; after: number }[]
}

export interface WorkshopInput {
  today: string
  period: Period
  sessions: PlanSession[]        // effective plan (base + engine + manual)
  manual: Overrides              // The runner's edits (the layer suggestions write into)
  actual: ActualKm
  fitness: Fitness
  events: WorkshopEvent[]
  profile: AthleteProfile | null
  recent: RecentVolume | null
  pauses?: PauseInput            // Krank/Pause (07-08): the pause and its return weeks never gain km or a key session
  feedback?: FeedbackInput | null  // run + weekly feedback (07-25): a suggestion and hints, never a silent change
}

const FRESH_TSB = -10
const MIN_CHANGE_KM = 2         // smaller suggestions are not worth a decision
const FATIGUE_DAYS = 7

const isProtected = (s?: PlanSession) => !!s && (s.type === 'race' || !!s.anchor || !!s.test)
const isTaper = (date: string) => !!weekOf(date)?.taper
const isRecovery = (date: string) => isEasyWeek(weekOf(date))   // recovery + cutback weeks: protected like taper weeks (06-01, F-06)

function context(input: WorkshopInput) {
  const { today, period, sessions, actual, events } = input
  const at = (d: string) => sessions.find((s) => s.date === d)
  const eventDates = new Set([...events.map((e) => e.date), ...blocks().map((b) => b.race.date), ...sessions.filter(isProtected).map((s) => s.date)])
  // A day the workshop may change: in the period, today or later, not run yet, not an event.
  const editable = (d: string) => d >= today && d >= period.from && d <= period.to && !(actual.get(d) ?? 0) && !isProtected(at(d))
  const beforeEvent = (d: string) => eventDates.has(plusDays(d, 1)) || eventDates.has(plusDays(d, 2))
  return { at, editable, beforeEvent, eventDates }
}

// Safety and profile, applied to every suggestion: past/run/event days are dropped, taper weeks and pause/return weeks never gain km,
// unavailable days get no session, the profile's max km per day caps additions; structure refitted to km.
export function finalize(input: WorkshopInput, changes: Overrides): Overrides {
  const { at, editable } = context(input)
  const out: Overrides = {}
  for (const [date, raw] of Object.entries(changes)) {
    if (!editable(date)) continue
    const before = at(date)
    const beforeKm = before && before.type !== 'rest' ? before.km ?? 0 : 0
    let s = { ...raw, date }
    let km = s.type === 'rest' ? 0 : s.km ?? 0
    if ((isTaper(date) || isRecovery(date)) && km > beforeKm) continue
    if (inPauseWindow(date, input.pauses) && (km > beforeKm || (raw.key && !before?.key))) continue
    if (km > beforeKm && !dayAvailable(input.profile, date)) continue
    const cap = profileMaxKm(input.profile, date)
    if (cap != null && km > Math.max(cap, beforeKm)) { km = Math.max(cap, beforeKm); s = { ...s, km } }
    s = fitSession(s)
    if (JSON.stringify(s) === JSON.stringify(before)) continue
    out[date] = s
  }
  return out
}

function weekTotals(input: WorkshopInput, changes: Overrides) {
  const weeks = new Map<string, { before: number; after: number }>()
  for (const date of Object.keys(changes)) {
    const start = monday(date)
    if (weeks.has(start)) continue
    const dates = Array.from({ length: 7 }, (_, i) => plusDays(start, i))
    const km = (d: string, s?: PlanSession) => (s && s.type !== 'race' && s.type !== 'rest' ? s.km ?? 0 : 0)
    weeks.set(start, {
      before: r1(dates.reduce((t, d) => t + km(d, input.sessions.find((x) => x.date === d)), 0)),
      after: r1(dates.reduce((t, d) => t + km(d, changes[d] ?? input.sessions.find((x) => x.date === d)), 0)),
    })
  }
  return [...weeks].map(([start, v]) => ({ start, ...v })).sort((a, b) => a.start.localeCompare(b.start))
}

function build(input: WorkshopInput, kind: SuggestionKind, title: string, why: string[], raw: Overrides): Suggestion | null {
  const changes = finalize(input, raw)
  const dates = Object.keys(changes).sort()
  if (!dates.length) return null
  const diff = dates.map((date) => ({ date, before: input.sessions.find((s) => s.date === date) ?? null, after: changes[date] }))
  const moved = diff.reduce((t, r) => t + Math.abs((r.after.type === 'rest' ? 0 : r.after.km ?? 0) - (r.before && r.before.type !== 'rest' ? r.before.km ?? 0 : 0)), 0)
  if (kind !== 'fatigue' && kind !== 'feedback-fatigue' && kind !== 'key-catchup' && moved < MIN_CHANGE_KM) return null
  return { id: `${kind}:${input.period.from}:${input.period.to}`, kind, title, why, changes, diff, weekKm: weekTotals(input, changes) }
}

// 1 · Missing km of a plan week spread over its remaining easy days (same rule and caps as "Ausgleichen").
function missedKm(input: WorkshopInput): Suggestion | null {
  const { today, period, sessions, actual, manual } = input
  const changes: Overrides = {}
  const why: string[] = []
  for (const w of allWeeks()) {
    if (w.end < period.from || w.start > period.to || w.end < today || w.taper || isEasyWeek(w)) continue
    if (!rulesFor(w.start).rebalance) continue                  // the block's method drops missed km (07-21)
    const summary = weekSummary(w, today, sessions, actual)
    if (summary.gapKm < MIN_CHANGE_KM) continue
    const { added } = balanceWeek(summary, today, manual)
    if (!added.length) continue
    for (const { date, km } of added) {
      const s = sessions.find((x) => x.date === date)!
      changes[date] = { ...s, km: r1((s.km ?? 0) + km), notes: join(s.notes, `+${fmtKm(km)} km aus der Woche`) }
    }
    why.push(`KW ${w.kw}: Ziel ${fmtKm(w.km)} km, geplant/gelaufen ${fmtKm(summary.forecastKm)} km → ${fmtKm(summary.gapKm)} km fehlen.`)
  }
  const r = rulesFor(today)
  return build(input, 'missed-km', 'Fehlende km verteilen',
    [...why, `Nur auf lockere Tage, höchstens +${Math.round(r.capPct * 100)} % bzw. +${fmtKm(r.capKm)} km pro Tag, nie in Taper-Wochen.`], changes)
}

// 2 · Volume of the last weeks far from the plan → scale the period's easy and long km.
function volume(input: WorkshopInput): Suggestion | null {
  const { recent, fitness, period, sessions, today } = input
  if (!recent) return null
  const r = rulesFor(today)
  const { editable, beforeEvent } = context(input)
  const days = sessions.filter((s) => s.date >= period.from && s.date <= period.to && editable(s.date))
  const pct = Math.round(recent.ratio * 100)
  const base = `Letzte ${recent.weeks} Wochen: ${fmtKm(recent.runKm)} von ${fmtKm(recent.plannedKm)} km gelaufen (${pct} %).`
  if (recent.ratio <= r.recentLow) {
    const factor = Math.max(0.7, Math.min(0.95, recent.ratio + 0.1))
    const changes: Overrides = {}
    for (const s of days) {
      if (!(s.type === 'easy' || s.type === 'long' || s.type === 'recovery') || s.key || !s.km) continue
      const km = Math.max(3, half(s.km * factor))
      if (km < s.km) changes[s.date] = { ...s, km, notes: join(s.notes, `Umfang −${Math.round((1 - factor) * 100)} % (Werkstatt)`) }
    }
    return build(input, 'volume-down', `Umfang um ${Math.round((1 - factor) * 100)} % senken`,
      [base, `Lockere und lange Läufe im Zeitraum auf ${Math.round(factor * 100)} %: knapp über dem, was zuletzt wirklich ging. Qualitätseinheiten bleiben.`], changes)
  }
  if (recent.ratio >= r.recentHigh && (fitness.tsb ?? -99) >= FRESH_TSB) {
    const factor = Math.min(1.1, recent.ratio)
    const changes: Overrides = {}
    for (const s of days) {
      if (s.type !== 'easy' || s.key || !s.km || isTaper(s.date) || isRecovery(s.date) || beforeEvent(s.date) || !canTakeExtra(s, s.date)) continue
      const km = half(s.km * factor)
      if (km > s.km) changes[s.date] = { ...s, km, notes: join(s.notes, `Umfang +${Math.round((factor - 1) * 100)} % (Werkstatt)`) }
    }
    return build(input, 'volume-up', `Umfang um ${Math.round((factor - 1) * 100)} % erhöhen`,
      [base, `Form frisch (TSB ${Math.round(fitness.tsb ?? 0)}). Nur lockere Läufe, nie Taper-Wochen.`], changes)
  }
  return null
}

// The next hard session within a week becomes an easy run at the block's share (fatigue guard shape; 07-25 reuses it).
function softenNext(input: WorkshopInput, kind: 'fatigue' | 'feedback-fatigue', why: string[], cause: string): Suggestion | null {
  const { sessions, today } = input
  const r = rulesFor(today)
  const { editable } = context(input)
  const next = sessions.find((s) => s.date >= today && s.date <= plusDays(today, FATIGUE_DAYS - 1) && editable(s.date) && isHard(s))
  if (!next) return null
  const km = Math.max(3, half((next.km ?? 0) * r.fatigueShare))
  return build(input, kind, `${next.title} am ${dayLabel(next.date)} locker laufen`,
    [...why, `${fmtKm(km)} km locker statt ${fmtKm(next.km ?? 0)} km ${next.title}.`],
    { [next.date]: { date: next.date, type: 'easy', km, title: `Locker statt ${next.title}`, notes: `${cause} (Werkstatt) · geplant war: ${next.title}` } })
}

// 3 · Red zone now → the next hard session within a week becomes an easy run.
function fatigue(input: WorkshopInput): Suggestion | null {
  const { fitness, today } = input
  const r = rulesFor(today)
  if (!tired(fitness, r)) return null
  const why = [
    fitness.tsb != null && fitness.tsb < r.tsbRed ? `TSB ${Math.round(fitness.tsb)} (rot unter ${r.tsbRed})` : null,
    fitness.acwr != null && acwrStreak(fitness, r) >= 1 ? `${acwrWhy(fitness, r)} (rot über ${r.acwrRed})` : null,
    recoveryRedWhy(fitness),
  ].filter((x): x is string => !!x)
  return softenNext(input, 'fatigue', why, 'Erholung')
}

// 5 · Feedback (07-25, research feedback.md §2): easy runs too hard on several days → the same offer as the fatigue
// guard, unless that one already names a session. Only ever a suggestion; the engine does not read feedback.
function feedbackFatigue(input: WorkshopInput, alreadyOffered: boolean): Suggestion | null {
  if (alreadyOffered) return null
  const signal = feedbackSignals(input).find((x) => x.kind === 'easy-too-hard')
  if (!signal) return null
  return softenNext(input, 'feedback-fatigue', signal.why, 'Erholung nach deinem Feedback')
}

// 4 · A missed key session in the period → onto the best easy or free day after it. A missed test (Generalprobe) follows the
// engine's rule (07-12): until the day before the taper, and not when another test comes first (that one decides Plan A/B).
function keyCatchup(input: WorkshopInput): Suggestion | null {
  const { today, period, sessions, actual, profile } = input
  const { editable, beforeEvent } = context(input)
  const missed = datesOf(period).map((d) => dayState(d, today, sessions, actual))
    .filter((d) => d.status === 'missed' && d.session?.key && d.session.type !== 'race' && !d.session.anchor)
  for (const key of [...missed].reverse()) {
    const s = key.session!
    const r = rulesFor(key.date)
    if (!r.moveMissedKey) continue                              // the block's method lets a missed key session go (07-21)
    const win = s.test ? testWindow(s, sessions) : null
    if (win && (win.next || win.end < today)) continue
    const last = win ? win.end : plusDays(key.date, r.maxShiftDays)
    const hardNear = (d: string, n: number) => Array.from({ length: 2 * n + 1 }, (_, i) => plusDays(d, i - n))
      .some((x) => x !== d && isHard(sessions.find((y) => y.date === x)))
    // Same rule as the engine: no other key session within ± keyGapDays — counting sessions ahead or run, not the missed one.
    const keyNear = (d: string) => Array.from({ length: 2 * r.keyGapDays + 1 }, (_, i) => plusDays(d, i - r.keyGapDays))
      .some((x) => x !== d && x !== key.date && !!sessions.find((y) => y.date === x)?.key && (x >= today || (actual.get(x) ?? 0) > 0))
    const target = datesOf(period).find((d) => {
      const t = sessions.find((x) => x.date === d)
      return d > today && d <= last && editable(d) && !isTaper(d) && !beforeEvent(d)
        && (!t || t.type === 'rest' || canTakeExtra(t, d)) && !hardNear(d, 1) && !keyNear(d) && dayAvailable(profile, d)
        && sessions.find((y) => y.date === plusDays(d, -1))?.type !== 'long'
        && (profileMaxKm(profile, d) ?? 99) >= (s.km ?? 0)
    })
    if (!target) continue
    const before = sessions.find((x) => x.date === target)
    return build(input, 'key-catchup', `${s.title} am ${dayLabel(target)} nachholen`,
      [`${s.title} vom ${dayLabel(key.date)} wurde nicht gelaufen.`,
        ...(s.test ? [`Testlauf: nachholbar bis ${dayLabel(last)} (Tag vor dem Taper), kein weiterer Test davor.`] : []),
        `${dayLabel(target)} ${before && before.type !== 'rest' ? `ersetzt ${fmtKm(before.km ?? 0)} km locker` : 'war frei'}; kein harter Tag direkt davor oder danach, nicht kurz vor einem Rennen.`],
      { [target]: { ...s, date: target, notes: join(s.notes, `nachgeholt vom ${dayLabel(key.date)}`) } })
  }
  return null
}

export function suggestions(input: WorkshopInput): Suggestion[] {
  const tiredNow = fatigue(input)
  return [tiredNow, feedbackFatigue(input, !!tiredNow), keyCatchup(input), missedKm(input), volume(input)].filter((s): s is Suggestion => !!s)
}

// Hints from the feedback that change nothing by themselves (pain → Pause, goal pace feels easy).
export function workshopHints(input: WorkshopInput): FeedbackHint[] {
  return feedbackHints(feedbackSignals(input))
}

// ─── Apply / undo (pure) ──────────────────────────────────────────────────────

export interface WorkshopLogEntry {
  id: string
  at: string
  title: string
  period: string
  before: Record<string, PlanSession | null>   // The runner's edits of those days before the change (null = none)
  after: Overrides
  undoneAt?: string
}

export function applyChanges(manual: Overrides, s: Pick<Suggestion, 'id' | 'title' | 'changes'>, period: Period, at: string) {
  const before = Object.fromEntries(Object.keys(s.changes).map((d) => [d, manual[d] ?? null]))
  const entry: WorkshopLogEntry = { id: `${s.id}@${at}`, at, title: s.title, period: period.label, before, after: s.changes }
  return { manual: { ...manual, ...s.changes }, entry }
}

// Restores the exact earlier edits of those days. Days changed again since are reported, and restored anyway.
export function undoEntry(manual: Overrides, e: WorkshopLogEntry) {
  const next = { ...manual }
  const changedSince = Object.keys(e.after).filter((d) => JSON.stringify(manual[d]) !== JSON.stringify(e.after[d]))
  for (const [d, prev] of Object.entries(e.before)) {
    if (prev) next[d] = prev
    else delete next[d]
  }
  return { manual: next, changedSince }
}

export { isoDay }
