// Plan edits: moving sessions between days, carrying over unrun km, and rebalancing a week
// so it still reaches its target. Pure functions — used by the page and by the API routes.
import { addDays, differenceInCalendarDays, format, getDay, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { type PlanSession, type PlanWeek } from './types'
import { WEEKDAY_NAME, allSessions, allWeeks, firstPlanStart, raceOf, recoveryWeekday } from './blocks'
import { fmtKm } from './format'
import { athlete } from '@/lib/athlete'
import { fitSession, formatNotes, parseStructure, rescale } from './structure'
import { rulesFor } from './rules'
import { pauseLayer, type PauseInput } from './pause'
import { KB, isKeyDay, withStrength } from './strength'

// date → replacement session for that day (type 'rest' clears the day)
export type Overrides = Record<string, PlanSession>
// date → km actually run that day
export type ActualKm = Map<string, number>

const r1 = (n: number) => Math.round(n * 10) / 10

// Manual edits of the session itself. An entry that only sets the kettlebell marker (`strengthOnly`) is none: the day
// keeps following the plan and the engine, and the engine may still change it.
export const dayEdits = (overrides: Overrides): Overrides =>
  Object.fromEntries(Object.entries(overrides).filter(([, s]) => !s.strengthOnly))

// Layers: plan → engine → return caps after a pause → manual edits → paused days (Krank beats everything but anchors).
// A marker-only entry sets the kettlebell marker on the day as the layers below show it.
export function effectiveSessions(overrides: Overrides, engine: Overrides = {}, pause?: PauseInput): PlanSession[] {
  const plan = new Map(allSessions().map((s) => [s.date, s]))
  const byDate = new Map(plan)
  // A stale engine change never covers a fixed day (a minor race added later, 07-16).
  for (const [date, s] of Object.entries(engine)) if (!byDate.get(date)?.anchor) byDate.set(date, { ...s, date })
  const layer = pause?.pauses.length ? pauseLayer(byDate, pause, plan) : null
  if (layer) for (const [date, s] of Object.entries(layer.caps)) byDate.set(date, s)
  for (const [date, s] of Object.entries(overrides)) {
    if (!s.strengthOnly) byDate.set(date, { ...s, date })
    else if (byDate.has(date)) byDate.set(date, withStrength(byDate.get(date)!, s.strength))
  }
  if (layer) for (const [date, s] of Object.entries(layer.paused)) byDate.set(date, s)
  // One rule for every layer: the workout text always matches the day's km.
  return [...byDate.values()].map(fitSession).sort((a, b) => a.date.localeCompare(b.date))
}

export function isHard(s?: PlanSession) {
  return !!s && (s.type === 'tempo' || s.type === 'intervals' || s.type === 'race' || (s.type === 'long' && !!s.pace))
}

function isRun(s?: PlanSession): s is PlanSession & { km: number } {
  return !!s && s.type !== 'rest' && (s.km ?? 0) > 0
}

function rank(s: PlanSession) {
  if (s.type === 'race') return 5
  if (isHard(s)) return 4
  if (s.type === 'long') return 3
  if (s.type === 'easy') return 2
  return 1
}

export function dayLabel(date: string) {
  return format(parseISO(date), 'EEE d.M.', { locale: de })
}

export function join(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(' · ')
}

// ─── Day state ────────────────────────────────────────────────────────────────

export type DayStatus = 'rest' | 'done' | 'partial' | 'missed' | 'planned' | 'extra' | 'paused'

export interface DayState {
  date: string
  session?: PlanSession
  plannedKm: number
  actualKm: number
  openKm: number      // planned but not run (partial or missed days)
  status: DayStatus
}

export function dayState(date: string, today: string, sessions: PlanSession[], actual: ActualKm): DayState {
  const session = sessions.find((s) => s.date === date)
  const plannedKm = isRun(session) ? session.km : 0
  const actualKm = actual.get(date) ?? 0
  let status: DayStatus
  if (actualKm > 0) status = plannedKm === 0 ? 'extra' : actualKm >= plannedKm * 0.95 ? 'done' : 'partial'
  else if (session?.paused) status = 'paused'
  else if (plannedKm === 0) status = 'rest'
  else status = date < today ? 'missed' : 'planned'
  const openKm = status === 'partial' || status === 'missed' ? r1(plannedKm - actualKm) : 0
  return { date, session, plannedKm, actualKm, openKm, status }
}

// What the week grid shows: every day with a run is marked as run, shorter or longer than planned (07-24).
// diffKm = run minus plan, only from 0,5 km; statuses above stay as they are for moving and rebalance.
export function runMark(day: DayState): { ran: boolean; diffKm: number | null } {
  const ran = day.actualKm > 0
  const diff = r1(day.actualKm - day.plannedKm)
  return { ran, diffKm: ran && day.plannedKm > 0 && Math.abs(diff) >= 0.5 ? diff : null }
}

// ─── Moving ───────────────────────────────────────────────────────────────────

// move: to a free day · swap: exchange two days · merge: one run with both distances
export type MoveMode = 'move' | 'swap' | 'merge'

export function moveModes(from: string, to: string, today: string, sessions: PlanSession[], actual: ActualKm): MoveMode[] {
  // Never onto race day, never across it (taper and recovery stay on their side).
  const race = raceOf(from).date
  if (to === from || to < today || to === race || (from < race) !== (to < race)) return []
  const src = dayState(from, today, sessions, actual)
  const dst = dayState(to, today, sessions, actual)
  if (src.session?.type === 'race' || src.session?.anchor || dst.session?.anchor) return []   // events stay put
  if (dst.actualKm > 0) return []                                // that day is already run
  if (dst.session?.paused) return []                             // Krank/Pause wins there: the session would vanish
  // Partly run: swap the whole session with a planned day (the run was really a different session),
  // or add the rest on top of that day.
  if (src.status === 'partial') return isRun(dst.session) ? ['swap', 'merge'] : ['merge']
  if (src.status === 'missed') return isRun(dst.session) ? ['merge'] : ['move']
  if (src.status === 'planned') return isRun(dst.session) ? ['swap', 'merge'] : ['move']
  return []
}

export function applyMove(
  overrides: Overrides, from: string, to: string, mode: MoveMode,
  today: string, sessions: PlanSession[], actual: ActualKm, auto?: PlanSession[],
): Overrides {
  if (!moveModes(from, to, today, sessions, actual).includes(mode)) return overrides
  const src = dayState(from, today, sessions, actual)
  const dst = dayState(to, today, sessions, actual)
  const S = src.session!
  const next = { ...overrides }

  if (src.status === 'partial' && mode === 'merge') {
    next[from] = { ...S, km: src.actualKm, notes: join(S.notes, `Rest ${fmtKm(src.openKm)} km → ${dayLabel(to)}`) }
    next[to] = addKm(dst.session, to, src.openKm, `+${fmtKm(src.openKm)} km von ${dayLabel(from)}`)
    return next
  }

  // Whole session. A missed day keeps what was run (nothing) and gives up its km.
  const moving = { ...S, km: src.status === 'missed' ? src.openKm : S.km }
  if (mode === 'move') {
    // A kettlebell marker set on the free day stays with that day; a key day itself takes none (strength.ts).
    next[to] = withStrength({ ...moving, date: to }, moving.strength ?? (isKeyDay(moving) ? null : dst.session?.strength))
    next[from] = restDay(from, `verschoben auf ${dayLabel(to)}`)
  } else if (mode === 'swap') {
    next[to] = { ...moving, date: to }
    next[from] = { ...dst.session!, date: from }
  } else {
    next[to] = mergeSessions(dst.session!, moving, to)
    next[from] = restDay(from, `zusammengelegt mit ${dayLabel(to)}`)
  }
  // Moved or swapped back: a day that is at its plan again carries no edit. Where the engine or a return cap changes
  // the day (`auto` = the plan as shown without manual edits) the edit stays, so nothing reappears under it.
  for (const d of [from, to]) {
    const s = next[d]
    const same = (o?: PlanSession) => (isRun(s) || isRun(o) ? !!o && sameSession(s, o) : true)
    if (same(allSessions().find((x) => x.date === d)) && (!auto || same(auto.find((x) => x.date === d)))) delete next[d]
  }
  return next
}

export function restDay(date: string, notes: string): PlanSession {
  return { date, type: 'rest', title: 'Ruhetag', notes }
}

function addKm(target: PlanSession | undefined, date: string, km: number, note: string): PlanSession {
  if (isRun(target)) return { ...target, date, km: r1(target.km + km), notes: join(target.notes, note) }
  return withStrength({ date, type: 'easy', km, title: 'Nachholen', notes: join('Locker, Zone 2', note) }, target?.strength)   // the free day's kettlebell marker stays
}

function mergeSessions(a: PlanSession, b: PlanSession, date: string): PlanSession {
  const [main, other] = rank(a) >= rank(b) ? [a, b] : [b, a]
  return withStrength({
    ...main,
    date,
    km: r1((a.km ?? 0) + (b.km ?? 0)),
    key: a.key || b.key,
    notes: join(main.notes, `+ ${fmtKm(other.km ?? 0)} km ${other.title}`),
  }, main.strength ?? other.strength)   // a kettlebell marker stays with the merged run
}

// ─── Editing one day's km ─────────────────────────────────────────────────────

// '14,5' or '14.5' → 14.5; null outside 0–60 km or when not a number.
export function parseKm(input: string): number | null {
  const t = input.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const km = Number(t)
  return km >= 0 && km <= 60 ? r1(km) : null
}

// The workout text counts as the plan shows it (fitted to the km): the plan file's own wording is not an edit.
function sameSession(a: PlanSession, b: PlanSession) {
  return a.type === b.type && (a.km ?? 0) === (b.km ?? 0) && a.title === b.title &&
    (fitSession(a).notes ?? '') === (fitSession(b).notes ?? '') && (a.pace ?? '') === (b.pace ?? '') && !!a.key === !!b.key &&
    JSON.stringify(a.strength ?? null) === JSON.stringify(b.strength ?? null)
}

// An edit back at the plan file's value is only dropped when the day then shows it: with an engine change or a return
// cap on that day (`auto` = the plan as shown without manual edits) the edit stays, or it would do nothing.
function showsWithout(next: PlanSession, date: string, auto?: PlanSession[]) {
  const shown = auto?.find((x) => x.date === date)
  return !shown || sameSession(next, shown)
}

// ─── Zone 2 or pace ───────────────────────────────────────────────────────────

// ─── The two days of a swap or a move ─────────────────────────────────────────

// The same session wherever it sits and whatever its km (a session switched to Zone 2 is still that session).
const sameKind = (a?: PlanSession, b?: PlanSession) => isRun(a) && isRun(b) && a.type === b.type && a.title === b.title && (a.pace ?? '') === (b.pace ?? '')
const kindOf = (s?: PlanSession) => (s?.strengthOnly ? undefined : s?.was ?? s)   // a marker-only entry moves no session
const planDay = (date: string) => allSessions().find((x) => x.date === date)
const inReach = (a: string, b: string) => a !== b && Math.abs(differenceInCalendarDays(parseISO(a), parseISO(b))) < 14   // a move reaches two weeks

// The plan day's pace session already sits on another day (swapped or moved there): a session like it in reach, on a
// day whose own plan session is a different one.
function sitsElsewhere(original: PlanSession, date: string, sessions: PlanSession[]) {
  return sessions.some((x) => inReach(x.date, date) && sameKind(kindOf(x), original) && !sameKind(planDay(x.date), original))
}

// The other half of the swap or move an edited day belongs to: the day its plan session went to, or the day the session
// it shows came from.
function pairedDays(overrides: Overrides, date: string): string[] {
  const here = kindOf(overrides[date]), plan = planDay(date)
  if (!here) return []
  return Object.keys(overrides).filter((d) => {
    if (!inReach(d, date)) return false
    const there = kindOf(overrides[d]), planThere = planDay(d)
    const wentThere = sameKind(there, plan) && !sameKind(planThere, plan) && !sameKind(here, plan)
    const cameFromThere = sameKind(here, planThere) && !sameKind(plan, planThere) && !sameKind(there, planThere)
    return wentThere || cameFromThere
  })
}

// Days back to their plan ("Original wiederherstellen", "Woche zurücksetzen") — together with the other half of a swap
// or a move: one day alone would fall back to the plan while the other keeps the session, which then shows twice (or,
// the other way round, not at all).
function dropEdits(overrides: Overrides, dates: string[]): Overrides {
  const drop = new Set(dates.flatMap((d) => [d, ...pairedDays(overrides, d)]))
  return Object.fromEntries(Object.entries(overrides).filter(([d]) => !drop.has(d)))
}

export const restoreDay = (overrides: Overrides, date: string) => dropEdits(overrides, [date])

// A day that can be switched: a run with pace (tempo, intervals, long run with pace, a test) or one already switched.
// Without a kept session (`was`) the plan file's day is the fallback — not when its pace session was swapped or moved
// to another day (`sessions` = the plan as shown): switching back would show that session twice.
export function z2State(s: PlanSession | undefined, date: string, sessions?: PlanSession[]): 'pace' | 'z2' | null {
  if (!s || s.type === 'race' || s.type === 'rest' || !(s.km ?? 0)) return null
  if (s.was) return isHard(s.was) ? 'z2' : null
  if (isHard(s)) return 'pace'
  const base = allSessions().find((x) => x.date === date)
  return base && isHard(base) && base.type !== 'race' && !(sessions && sitsElsewhere(base, date, sessions)) ? 'z2' : null
}

// Pace run → easy Zone 2 run with the same km; the event flag stays; the pace session is kept in `was`.
export function setZone2(overrides: Overrides, date: string, sessions: PlanSession[]): Overrides {
  const s = sessions.find((x) => x.date === date)
  if (z2State(s, date) !== 'pace') return overrides
  const { was: _was, ...orig } = s!
  const next: PlanSession = {
    date, type: 'easy', km: s!.km, title: s!.anchor ? `${s!.title} locker (Z2)` : 'Locker (Z2)',
    notes: `Zone 2 (HF ${athlete().zone2[0]}–${athlete().zone2[1]}) statt ${s!.title}.`,
    ...(s!.anchor ? { anchor: true } : {}), ...(s!.strength ? { strength: s!.strength } : {}), was: orig,
  }
  return { ...overrides, [date]: next }
}

// Back to the pace session: the kept one, or the original plan day. Same as the original plan → the edit is dropped.
export function setPace(overrides: Overrides, date: string, sessions: PlanSession[], auto?: PlanSession[]): Overrides {
  const s = sessions.find((x) => x.date === date)
  if (z2State(s, date, sessions) !== 'z2') return overrides
  const original = allSessions().find((x) => x.date === date)
  const kept = s!.was ?? original
  // Event and test flags come from the plan day when the kept session lost them.
  const restored = kept && original ? { ...kept, anchor: kept.anchor ?? original.anchor, test: kept.test ?? original.test } : kept
  const back = restored && withStrength(restored, s!.strength)   // the day's kettlebell marker as it is now
  const out = { ...overrides }
  const atPlan = !!back && !!original && sameSession(back, original) && !!back.anchor === !!original.anchor && back.test === original.test
  if (!back || (atPlan && showsWithout(back, date, auto))) delete out[date]
  else out[date] = { ...back, date }
  return out
}

// Kettlebell on/off for one day. Never on race day or a paused day. A marker added by hand is a regular one (30–40 Min.).
// On a day whose session was edited by hand the marker is part of that edit; back at the plan → the edit is dropped.
// Otherwise only the marker is stored (`strengthOnly`; the session in the entry is the day as shown at that moment and
// is not read): the day keeps following the plan and the engine. Back at what the day shows without it (`auto` = the
// plan as shown without manual edits) → the entry is dropped.
export const strengthEditable = (s: PlanSession | undefined, date: string) =>
  !!s && s.type !== 'race' && !s.paused && date >= firstPlanStart()
export function toggleStrength(overrides: Overrides, date: string, sessions: PlanSession[], auto?: PlanSession[]): Overrides {
  const s = sessions.find((x) => x.date === date)
  if (!s || !strengthEditable(s, date)) return overrides
  const next = withStrength(s, s.strength ? null : KB.regular)
  const original = allSessions().find((x) => x.date === date)
  const out = { ...overrides }
  if (overrides[date] && !overrides[date].strengthOnly) {
    if (original && sameSession(next, original) && !next.was && showsWithout(next, date, auto)) delete out[date]
    else out[date] = next
    return out
  }
  const under = (auto?.find((x) => x.date === date) ?? original)?.strength
  if (JSON.stringify(next.strength ?? null) === JSON.stringify(under ?? null)) delete out[date]
  else out[date] = { ...next, strengthOnly: true }
  return out
}

// What a km edit does to a structured session: the warm-up/cool-down adapt ('ok'), or the
// block no longer fits and a shorter one is proposed ('block'). Null for unstructured sessions.
export function kmEditEffect(session: PlanSession | undefined, km: number): { kind: 'ok' | 'block'; notes: string } | null {
  const st = parseStructure(session?.notes)
  if (!session || !st || km <= 0 || ['easy', 'recovery'].includes(session.type)) return null
  const r = rescale(st, km)
  // Same text the plan will show (fitSession): a shortened block carries "Block gekürzt (geplant: …)".
  return { kind: r.ok ? 'ok' : 'block', notes: fitSession({ ...session, km, notes: session.notes }).notes ?? '' }
}

// Set a day's planned km by hand. A free day becomes an easy run, 0 km a rest day.
// Structured sessions keep their block and adapt warm-up/cool-down; a block that no longer fits
// is shortened (same rule as fitSession). Back to the original plan → the override is dropped.
// Race day stays as it is. (`shortenBlock` is kept for old callers; shortening always applies.)
export function setDayKm(overrides: Overrides, date: string, km: number, sessions: PlanSession[], _opts: { shortenBlock?: boolean } = {}, auto?: PlanSession[]): Overrides {
  const session = sessions.find((s) => s.date === date)
  if (session?.type === 'race') return overrides
  km = r1(Math.min(60, Math.max(0, km)))
  const effect = kmEditEffect(session, km)
  const notes = effect ? effect.notes : session?.notes
  const next: PlanSession = km === 0 ? restDay(date, 'auf 0 km gesetzt')
    : isRun(session) ? { ...session, date, km, notes }
    : withStrength({ date, type: 'easy', km, title: 'Locker', notes: 'Locker, Zone 2' }, session?.strength)   // the free day's kettlebell marker stays
  const original = allSessions().find((s) => s.date === date)
  const out = { ...overrides }
  if (original && sameSession(next, original) && showsWithout(next, date, auto)) delete out[date]
  else out[date] = next
  return out
}

// ─── Week totals, rules, rebalancing ──────────────────────────────────────────

export function weekDates(week: PlanWeek) {
  return Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(week.start), i), 'yyyy-MM-dd'))
}

export interface WeekSummary {
  week: PlanWeek
  days: DayState[]
  doneKm: number        // run so far
  remainingKm: number   // still planned from today on
  forecastKm: number
  gapKm: number         // target − forecast (positive = missing)
  warnings: string[]
}

export function weekSummary(week: PlanWeek, today: string, sessions: PlanSession[], actual: ActualKm): WeekSummary {
  // The race is not part of the weekly volume (KW45 target is the 30 km taper).
  const days = weekDates(week).map((d) => dayState(d, today, sessions, actual))
  const volume = days.filter((d) => d.session?.type !== 'race')
  const doneKm = r1(volume.reduce((t, d) => t + d.actualKm, 0))
  const remainingKm = r1(volume.filter((d) => d.actualKm === 0 && d.date >= today).reduce((t, d) => t + d.plannedKm, 0))
  const forecastKm = r1(doneKm + remainingKm)
  return { week, days, doneKm, remainingKm, forecastKm, gapKm: r1(week.km - forecastKm), warnings: ruleWarnings(days) }
}

// The block's own rules (07-21): touching hard days only where its key gap is ≥ 2 days; more hard days than the plan
// itself has for the week (at least 2); a long run on the block's recovery day (hand-written blocks: Sunday).
function ruleWarnings(days: DayState[]) {
  const warnings: string[] = []
  const hard = days.filter((d) => isHard(d.session))
  const first = days[0].date
  const gap = rulesFor(first).keyGapDays
  const dates = new Set(days.map((d) => d.date))
  const plannedHard = allSessions().filter((s) => dates.has(s.date) && isHard(s) && s.type !== 'race').length
  for (let i = 1; i < days.length; i++) {
    if (gap >= 2 && isHard(days[i - 1].session) && isHard(days[i].session)) {
      warnings.push(`Zwei harte Tage hintereinander: ${dayLabel(days[i - 1].date)} und ${dayLabel(days[i].date)}`)
    }
  }
  const maxHard = Math.max(2, plannedHard)
  if (hard.filter((d) => d.session?.type !== 'race').length > maxHard) warnings.push(maxHard === 2 ? 'Mehr als zwei harte Tage in dieser Woche' : `Mehr als ${maxHard} harte Tage in dieser Woche`)
  if (days.every((d) => d.plannedKm > 0 || d.actualKm > 0)) warnings.push('Kein Ruhetag in dieser Woche')
  const rec = recoveryWeekday(first)
  const recDay = days.find((d) => getDay(parseISO(d.date)) === rec)
  if (recDay?.session?.type === 'long') warnings.push(`Longrun am ${WEEKDAY_NAME[rec]} — ${WEEKDAY_NAME[rec]} ist Regenerationstag`)
  return warnings
}

// Most km a day may reach through additions (engine or "Ausgleichen"), measured from its
// original plan, so repeated additions cannot pile up: +30 % or +5 km, whichever is less.
export function maxKm(date: string) {
  const k = allSessions().find((s) => s.date === date)?.km ?? 0
  const r = rulesFor(date)                                      // DEFAULT_RULES: +30 % / +5 km; a generated block: its template's caps
  return Math.floor(Math.min(k * (1 + r.capPct), k + r.capKm) * 2) / 2
}

// Days that may take extra km: easy runs only — no key or hard sessions, Longruns, races (anchors, 07-21),
// Regeneration days or the block's recovery day (hand-written blocks: Sunday).
export function canTakeExtra(s: PlanSession | undefined, date: string): s is PlanSession & { km: number } {
  return !!s && s.type === 'easy' && !s.key && !s.anchor && !isHard(s) && (s.km ?? 0) > 0 && getDay(parseISO(date)) !== recoveryWeekday(date)
}

// Spread missing km over the week's remaining easy days in 0.5 km steps, up to maxKm per day.
export function balanceWeek(summary: WeekSummary, today: string, overrides: Overrides) {
  const beforeEvent = (i: number) => { const n = summary.days[i + 1]?.session; return !!(n?.test || n?.anchor) }
  const candidates = summary.days.filter((d, i) =>
    d.date >= today && d.actualKm === 0 && canTakeExtra(d.session, d.date) && d.plannedKm < maxKm(d.date) && !beforeEvent(i))
  const added = new Map<string, number>()
  let gap = summary.gapKm
  while (gap >= 0.25) {
    const open = candidates
      .filter((d) => d.plannedKm + (added.get(d.date) ?? 0) + 0.5 <= maxKm(d.date))
      .sort((a, b) => (added.get(a.date) ?? 0) / a.plannedKm - (added.get(b.date) ?? 0) / b.plannedKm)
    if (!open.length) break
    added.set(open[0].date, (added.get(open[0].date) ?? 0) + 0.5)
    gap -= 0.5
  }

  const next = { ...overrides }
  for (const [date, km] of added) {
    const s = summary.days.find((d) => d.date === date)!.session!
    next[date] = { ...s, km: r1((s.km ?? 0) + km), notes: join(s.notes, `+${fmtKm(km)} km Ausgleich`) }
  }
  return { overrides: next, added: [...added].map(([date, km]) => ({ date, km })), unplacedKm: r1(Math.max(0, gap)) }
}

export function resetWeek(week: PlanWeek, overrides: Overrides): Overrides {
  return dropEdits(overrides, weekDates(week))
}

// Called at use time: live blocks register after this module is imported (logic audit 2026-10-26, finding 1).
export const planWeeks = () => allWeeks().filter((w) => w.start >= firstPlanStart())

// ─── Why does a week have more or fewer km than its target? ─────────────────────

export interface WeekBreakdown {
  targetKm: number
  planKm: number                          // plan file vs. week target (usually 0)
  engineKm: number                        // engine changes on days without a manual edit
  engineReasons: string[]
  manualKm: number                        // your edits vs. the plan file
  runKm: number                           // run more (+) or less (−) than planned so far
  forecastKm: number
}

// forecast = target + plan + engine + manual + run, each part in km.
export function weekBreakdown(week: PlanWeek, today: string, manual: Overrides, engine: Overrides,
  engineReasons: Map<string, string>, actual: ActualKm): WeekBreakdown {
  const dates = weekDates(week)
  const km = (list: PlanSession[], d: string) => { const s = list.find((x) => x.date === d); return isRun(s) && s.type !== 'race' ? s.km : 0 }
  const base = effectiveSessions({}), withEngine = effectiveSessions({}, engine), eff = effectiveSessions(manual, engine)
  let planKm = -week.km, engineKm = 0, manualKm = 0
  const reasons = new Set<string>()
  for (const d of dates) {
    planKm += km(base, d)
    if (manual[d] && !manual[d].strengthOnly) manualKm += km(eff, d) - km(base, d)
    else {
      engineKm += km(withEngine, d) - km(base, d)
      if (engine[d] && engineReasons.has(d)) reasons.add(engineReasons.get(d)!)
    }
  }
  const forecastKm = weekSummary(week, today, eff, actual).forecastKm
  const plannedKm = dates.reduce((t, d) => t + km(eff, d), 0)
  return {
    targetKm: week.km, planKm: r1(planKm), engineKm: r1(engineKm), engineReasons: [...reasons],
    manualKm: r1(manualKm), runKm: r1(forecastKm - plannedKm), forecastKm,
  }
}
