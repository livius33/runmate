// The plan engine: fixed rules that adapt the plan to what was actually run. Pure — the store
// (engine-store.ts) loads and saves its state. Every change is logged with its reason and can be
// undone; an undone change is vetoed so the engine does not make it again.
//
// Layers: base plan → engine changes → manual edits. The engine never writes a manually edited day.
import { addDays, differenceInCalendarDays, format, getDay, parseISO, startOfWeek } from 'date-fns'
import { hrZones, raceHr } from '@/lib/analytics/hr'
import { type PlanSession } from './types'
import { fmtClock, fmtKm, fmtPace, paceToS, qualityKm } from './format'
import { athlete } from '@/lib/athlete'
import { allWeeks, blockFor, blockPaces, firstPlanStart, isEasyWeek, raceOf, recoveryWeekday, weekOf } from './blocks'
import { canTakeExtra, dayLabel, effectiveSessions, isHard, join, maxKm, restDay, weekDates, type Overrides } from './effective'
import { blockAttempted, matchSessionRuns, qualityBlock, type DatedRun } from './pace-check'
import { DEFAULT_RULES, STRATEGY_LABEL, acwrStreak, acwrWhy, inRedZone, rulesFor, taperDaysOf, type EngineRules } from './rules'
import { inPauseWindow, type Pause, type PauseInput } from './pause'

export type EngineRule = 'missed-key' | 'rebalance' | 'fatigue' | 'recovery-week' | 'hr-cap' | 'recalibrate'

export interface EngineChange {
  id: string
  at: string                                   // ISO time the change was made
  rule: EngineRule
  key: string                                  // identifies the decision, e.g. 'missed-key:2026-10-03'
  vetoKey?: string                             // what undo vetoes, if broader than key (e.g. a whole week)
  addedKm?: number                             // rebalance: km added by this change
  reason: string                               // German, shown in the log
  before: Record<string, PlanSession | null>   // engine overrides before (null = none)
  after: Record<string, PlanSession>
  status: 'active' | 'undone' | 'info'         // info = logged, nothing changed
}

export interface EngineState {
  overrides: Overrides
  log: EngineChange[]
  vetoes: string[]
}

export const EMPTY_ENGINE: EngineState = { overrides: {}, log: [], vetoes: [] }

export interface Fitness { tsb: number | null; acwr: number | null; acwrRecent?: (number | null)[] }   // acwrRecent: today first (07-23)

export interface EngineInput {
  today: string
  at: string
  manual: Overrides
  state: EngineState
  runs: DatedRun[]
  fitness?: Fitness
  // Last day fully covered by a successful sync. Later past days are not "missed" yet — their
  // runs may just not be synced. Undefined = no restriction (tests).
  syncedThrough?: string | null
  // Krank/Pause periods (07-08): paused days are rest in every layer; the pause and the two return weeks are left alone
  // by missed-key and rebalance (missed km are not made up).
  pauses?: Pause[]
}

const pz = (i: { today: string; pauses?: Pause[] }): PauseInput | undefined => (i.pauses?.length ? { pauses: i.pauses, today: i.today } : undefined)

// Red zone, same thresholds as the Rennbereitschaft card: "Sehr müde" and "Hoch".
// The default values (lib/plan/rules.ts DEFAULT_RULES); a generated block's own come from rulesFor(date).
export const TSB_RED = DEFAULT_RULES.tsbRed
export const ACWR_RED = DEFAULT_RULES.acwrRed

export function tired(f?: Fitness, r: EngineRules = DEFAULT_RULES) {
  return inRedZone(f, r)
}

// Nothing moves into the block's taper (07-18: its own length; hand-written and older blocks 9 days, rules.ts).
const RECOVERY_INSERT_GAP_DAYS = 21   // red zone → recovery week (07-18): at most once in this many days
const DONE_SHARE = 0.8       // a run of ≥ 80 % of the planned km counts
const MIN_REBALANCE_KM = 2   // smaller gaps are not worth changing the plan
const HR_CAP_DAYS = 7        // HF-Deckel looks back and ahead one week
const PACE_SLOW_S = 10       // block slower than goal pace by more than this: fallback too
const RECAL_DAYS = 10        // blocks older than this are not evaluated
const MIN_BLOCK_KM = 10

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')

export function runEngine(input: EngineInput): { state: EngineState; added: EngineChange[] } {
  // First take back additions that no longer hold (a "missed" run was synced later, or the day
  // was edited by hand), then run the rules in order, each on the state the previous one left.
  const corrected = correctRebalance(input)
  let state = corrected.state
  const added: EngineChange[] = [...corrected.added]
  for (const rule of [fatigue, recoveryWeek, missedKey, rebalance, hrCap, recalibrate]) {
    for (const change of rule({ ...input, state })) {
      state = apply(state, change)
      added.push(change)
    }
  }
  return { state, added }
}

function apply(state: EngineState, change: EngineChange): EngineState {
  return {
    ...state,
    overrides: { ...state.overrides, ...change.after },
    log: [...state.log, change],
  }
}

// ─── Rule: fatigue guard ──────────────────────────────────────────────────────

// In the red zone the next hard session within three days becomes an easy run. The race and
// the Generalprobe are anchors: they stay, and the log carries a warning instead.
function fatigue({ today, at, manual, state, runs, fitness, pauses }: EngineInput): EngineChange[] {
  const r = rulesFor(today)
  if (!tired(fitness, r)) return []
  const window = Array.from({ length: r.fatigueDays }, (_, i) => day(today, i))
  const inWindow = (c: EngineChange) => c.rule === 'fatigue' && c.status === 'active' && Object.keys(c.after).some((d) => window.includes(d))
  if (state.log.some(inWindow)) return []                      // one softened session at a time
  const known = new Set([...state.vetoes, ...state.log.filter((c) => c.status !== 'undone').map((c) => c.key)])
  const sessions = effectiveSessions(manual, state.overrides, pz({ today, pauses }))
  const why = [
    fitness!.tsb != null && fitness!.tsb < r.tsbRed ? `TSB ${String(Math.round(fitness!.tsb)).replace('-', '−')}` : null,
    fitness!.acwr != null && acwrStreak(fitness, r) >= 1 ? acwrWhy(fitness!, r) : null,
  ].filter(Boolean).join(', ')
  // The engine softens; a template asking for another strategy is named, until that strategy exists.
  const asked = r.fatigueStrategy === 'intensity_reduction' || r.fatigueStrategy === 'recovery_week_insertion' ? ''
    : ` (Vorlage: ${STRATEGY_LABEL[r.fatigueStrategy]} – vorerst lockerer Lauf)`

  for (const d of window) {
    const s = sessions.find((x) => x.date === d)
    if (!isHard(s) || manual[d] || runs.some((r) => r.date === d)) continue
    if (s!.type === 'race' || s!.test || s!.anchor) {
      const key = `fatigue-anchor:${d}`
      if (known.has(key)) return []
      return [{
        id: `${key}@${at}`, at, rule: 'fatigue', key, before: {}, after: {}, status: 'info',
        reason: `Sehr müde (${why}) vor ${s!.title} am ${dayLabel(d)}: die Tage davor ruhig halten.`,
      }]
    }
    const key = `fatigue:${d}`
    if (known.has(key)) return []                              // undone = keep it hard
    const km = Math.max(1, Math.round((s!.km ?? 0) * r.fatigueShare * 2) / 2)
    const after: Record<string, PlanSession> = {
      [d]: { date: d, type: 'easy', km, title: `Locker statt ${s!.title}`,
        notes: join(`Ermüdungsschutz (${why})`, `geplant war: ${s!.title}${s!.km ? ` (${fmtKm(s!.km)} km)` : ''}`) },
    }
    return [{
      id: `${key}@${at}`, at, rule: 'fatigue', key, status: 'active',
      before: { [d]: state.overrides[d] ?? null }, after,
      reason: `Ermüdungsschutz (${why}): ${s!.title} am ${dayLabel(d)} wird lockerer Lauf (${fmtKm(km)} km)${asked}`,
    }]
  }
  return []
}

// ─── Rule: red zone → the next week becomes a recovery week (07-18) ──────────

// Only when the block's template asks for it (fatigue trigger → recovery_week_insertion). The next week of the same
// block that has not started becomes a recovery week at the template's recovery volume (share of the last load week);
// never a taper, recovery or light week, a week with a race or test, or a Krank/Pause window; at most once in 21 days.
export const insertedRecoveryWeek = (state: EngineState, date: string) => state.log.some((c) => {
  if (c.rule !== 'recovery-week' || c.status !== 'active') return false
  const start = c.key.slice('recovery-week:'.length)
  return date >= start && date <= day(start, 6)
})

function recoveryWeek({ today, at, manual, state, fitness, pauses }: EngineInput): EngineChange[] {
  const r = rulesFor(today)
  if (r.fatigueStrategy !== 'recovery_week_insertion' || !r.recoveryVolume || !tired(fitness, r)) return []
  const since = day(today, -RECOVERY_INSERT_GAP_DAYS)
  const recent = (key: string) => key.startsWith('recovery-week:') && key.slice('recovery-week:'.length) > since
  if (state.log.some((c) => c.status !== 'info' && recent(c.key)) || state.vetoes.some(recent)) return []
  const block = blockFor(today)
  const weeks = allWeeks()
  const i = weeks.findIndex((w) => w.start > today)
  const week = weeks[i]
  if (!week || !block || blockFor(week.start)?.id !== block.id) return []
  if (week.taper || isEasyWeek(week) || week.light || week.holiday) return []
  const dates = weekDates(week)
  if (dates.some((d) => inPauseWindow(d, pz({ today, pauses })))) return []
  const sessions = effectiveSessions(manual, state.overrides, pz({ today, pauses }))
  const inWeek = sessions.filter((s) => dates.includes(s.date))
  if (inWeek.some((s) => s.type === 'race' || s.anchor || s.test)) return []
  const prior = weeks.slice(0, i).filter((w) => !isEasyWeek(w) && !w.taper)
  const loadKm = prior[prior.length - 1]?.km ?? week.km
  const runKm = (s: PlanSession) => (s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)
  const planned = inWeek.reduce((t, s) => t + runKm(s), 0)
  const factor = Math.min(1, (r.recoveryVolume * loadKm) / Math.max(1, planned))
  if (factor >= 1) return []
  const before: Record<string, PlanSession | null> = {}
  const after: Record<string, PlanSession> = {}
  for (const s of inWeek) {
    if (manual[s.date] || runKm(s) === 0) continue
    const km = Math.max(3, Math.round(runKm(s) * factor * 2) / 2)
    if (km >= runKm(s)) continue
    before[s.date] = state.overrides[s.date] ?? null
    after[s.date] = { ...s, km, notes: join(s.notes, 'Erholungswoche (Ermüdungsschutz)') }
  }
  if (!Object.keys(after).length) return []
  const total = inWeek.reduce((t, s) => t + runKm(after[s.date] ?? s), 0)
  const key = `recovery-week:${week.start}`
  return [{
    id: `${key}@${at}`, at, rule: 'recovery-week', key, status: 'active', before, after,
    reason: `Sehr müde: die Woche ab ${dayLabel(week.start)} wird nach deiner Vorlage Erholungswoche (${fmtKm(total)} statt ${fmtKm(planned)} km).`,
  }]
}

// ─── Rule: missed key sessions are moved, not dropped ─────────────────────────

function missedKey({ today, at, manual, state, runs, fitness, syncedThrough, pauses }: EngineInput): EngineChange[] {
  const out: EngineChange[] = []
  // A "nicht nachholbar" note does not block: the session is moved as soon as a day frees up.
  const known = new Set([...state.vetoes, ...state.log.filter((c) => c.status === 'active').map((c) => c.key)])
  const noted = new Set(state.log.filter((c) => c.status === 'info' && c.rule === 'missed-key').map((c) => c.key))
  // Days the engine already moved a session to: no second move from there.
  const targets = new Set(state.log.filter((c) => c.status === 'active' && c.rule === 'missed-key')
    .flatMap((c) => Object.entries(c.after).filter(([, s]) => s.type !== 'rest').map(([d]) => d)))
  let overrides = state.overrides
  let sessions = effectiveSessions(manual, overrides, pz({ today, pauses }))
  const past = sessions.filter((s) => s.date >= firstPlanStart() && s.date < today && s.type !== 'rest' && isSynced(s.date, syncedThrough))
  const matched = matchSessionRuns(past, runs)
  const kmOn = (d: string) => runs.filter((r) => r.date === d).reduce((t, r) => t + r.km, 0)

  for (const s of past) {
    if (!s.key || s.type === 'race' || s.anchor || !s.km || manual[s.date] || targets.has(s.date)) continue
    if (isEasyWeek(weekOf(s.date))) continue                     // recovery: missed is missed
    if (inPauseWindow(s.date, pz({ today, pauses }))) continue   // Krank/Pause: missed is missed
    const key = `missed-key:${s.date}`
    if (known.has(key)) continue
    const r = rulesFor(s.date)
    if (!s.test && day(s.date, r.maxShiftDays) < today) continue   // too old to catch up (tests: window below)
    if (wasRun(s, matched.get(s.date) ?? null, runs, sessions)) continue

    if (!r.moveMissedKey) {                                     // the template lets missed key sessions go
      if (!noted.has(key)) out.push({
        id: `${key}@${at}`, at, rule: 'missed-key', key, before: {}, after: {}, status: 'info',
        reason: `${s.title} am ${dayLabel(s.date)} verpasst: nach deiner Vorlage nicht nachgeholt, weiter wie geplant.`,
      })
      continue
    }
    const lastDay = day(raceOf(s.date).date, -taperDaysOf(rulesFor(s.date)))   // nothing moves into this block's taper
    // A missed test (Generalprobe) may be caught up until the day before the taper, unless another test comes
    // before then: that one decides Plan A/B instead.
    let end = lastDay
    if (s.test) {
      const win = testWindow(s, sessions)
      end = win.end
      if (end < today) continue                                 // window over: missed is missed
      const next = win.next
      if (next) {
        if (!noted.has(key)) out.push({
          id: `${key}@${at}`, at, rule: 'missed-key', key, before: {}, after: {}, status: 'info',
          reason: `${s.title} am ${dayLabel(s.date)} verpasst: wird nicht verschoben, ${next.title} am ${dayLabel(next.date)} entscheidet.`,
        })
        continue
      }
    }

    // While tired, nothing moves into the days the fatigue guard protects (today and the next fatigueDays − 1).
    const rt = rulesFor(today)
    const from = tired(fitness, rt) ? day(today, rt.fatigueDays) : today
    // Pause windows and recovery weeks the engine inserted (07-18) take nothing in.
    const target = findTarget(s, from, end, sessions, manual, kmOn, r, (d) => inPauseWindow(d, pz({ today, pauses })) || insertedRecoveryWeek(state, d))
    if (!target) {
      if (noted.has(key)) continue                              // already noted, don't repeat
      out.push({
        id: `${key}@${at}`, at, rule: 'missed-key', key, before: {}, after: {}, status: 'info',
        reason: `${s.title} am ${dayLabel(s.date)} verpasst: nicht nachholbar, kein passender Tag bis ${dayLabel(s.test ? end : day(s.date, r.maxShiftDays) < end ? day(s.date, r.maxShiftDays) : end)}`,
      })
      continue
    }

    const replaced = sessions.find((x) => x.date === target)
    const after: Record<string, PlanSession> = {
      [target]: { ...s, date: target, notes: join(s.notes, `nachgeholt von ${dayLabel(s.date)}`) },
      [s.date]: restDay(s.date, `verschoben auf ${dayLabel(target)}`),
    }
    const before = Object.fromEntries(Object.keys(after).map((d) => [d, overrides[d] ?? null]))
    out.push({
      id: `${key}@${at}`, at, rule: 'missed-key', key, before, after, status: 'active',
      reason: `${s.title} (${s.km} km) am ${dayLabel(s.date)} verpasst → nachgeholt am ${dayLabel(target)}` +
        (replaced && replaced.type !== 'rest' && replaced.km ? `, ersetzt ${replaced.title} (${replaced.km} km)` : ''),
    })
    overrides = { ...overrides, ...after }
    sessions = effectiveSessions(manual, overrides, pz({ today, pauses }))
  }
  return out
}

// Done when the paired run (same day or a swapped neighbour) or any run within ±2 days on a
// day without its own key session reaches 80 % of the planned km.
function wasRun(s: PlanSession, paired: DatedRun | null, runs: DatedRun[], sessions: PlanSession[]) {
  const need = (s.km ?? 0) * DONE_SHARE
  if (paired && paired.km >= need) return true
  const keyDays = new Set(sessions.filter((x) => x.key && x.date !== s.date).map((x) => x.date))
  return runs.some((r) => r.km >= need && !keyDays.has(r.date) &&
    Math.abs(differenceInCalendarDays(parseISO(r.date), parseISO(s.date))) <= 2)
}

function findTarget(
  s: PlanSession, from: string, lastDay: string, sessions: PlanSession[], manual: Overrides, kmOn: (d: string) => number, r: EngineRules,
  paused: (d: string) => boolean = () => false,
): string | null {
  // The missed session's own (past) day never blocks its neighbours.
  const at = (d: string) => (d === s.date ? undefined : sessions.find((x) => x.date === d))
  // Key sessions move at most maxShiftDays; a test may use the whole window up to `lastDay` (the day before the taper).
  const end = s.test ? lastDay : day(s.date, r.maxShiftDays) < lastDay ? day(s.date, r.maxShiftDays) : lastDay
  for (let d = from; d <= end; d = day(d, 1)) {
    const here = at(d)
    if (manual[d] || kmOn(d) > 0) continue                     // manual edits win; day already run
    if (isEasyWeek(weekOf(d)) || weekOf(d)?.light) continue    // recovery and minor-race weeks: nothing moves in
    if (paused(d)) continue                                    // pause and return weeks: nothing moves in
    if (here && (here.key || here.anchor || isHard(here) || here.type === 'long' || here.type === 'race')) continue
    if (r.keyGapDays >= 2 && (isHard(at(day(d, -1))) || isHard(at(day(d, 1))))) continue   // two hard days in a row only where the block allows it
    if (at(day(d, -1))?.type === 'long') continue              // never the day after a long run (07-21)
    if (Array.from({ length: 2 * r.keyGapDays + 1 }, (_, i) => at(day(d, i - r.keyGapDays))).some((x) => x?.key)) continue
    if (s.type === 'long' && getDay(parseISO(d)) === recoveryWeekday(d)) continue   // no Longrun on the recovery day (hand-written blocks: Sunday)
    return d
  }
  return null
}

// A missed test may be caught up until the day before the first taper week (never inside the block's taper guard),
// unless another test comes before then: that one decides Plan A/B. Shared by the engine and Plan anpassen (07-12).
export function testWindow(s: PlanSession, sessions: PlanSession[]): { end: string; next: PlanSession | null } {
  const lastDay = day(raceOf(s.date).date, -taperDaysOf(rulesFor(s.date)))
  const taperStart = blockFor(s.date)?.weeks.find((w) => w.taper)?.start
  const end = taperStart && day(taperStart, -1) < lastDay ? day(taperStart, -1) : lastDay
  return { end, next: sessions.find((x) => x.test && x.date > s.date && x.date <= end && x.type !== 'rest') ?? null }
}

const isSynced = (date: string, syncedThrough?: string | null) =>
  syncedThrough === undefined || (syncedThrough != null && date <= syncedThrough)

// ─── Self-correction of rebalancing ───────────────────────────────────────────

// Take back rebalance additions that no longer hold: when its days were edited by hand (the
// manual edit replaces them), or when the week's additions exceed its missing km by ≥ 2 km
// (a "missed" run was synced later). Newest first; no veto, so the rule may act again.
function correctRebalance(input: EngineInput): { state: EngineState; added: EngineChange[] } {
  const { today, at, manual, runs, syncedThrough, pauses } = input
  let state = input.state
  const added: EngineChange[] = []
  const week = weekOf(today)
  const takeBack = (c: EngineChange, why: string) => {
    const overrides = { ...state.overrides }
    for (const d of Object.keys(c.after)) {
      const prev = c.before[d]
      if (prev) overrides[d] = prev
      else delete overrides[d]
    }
    state = {
      ...state, overrides,
      log: [...state.log.map((x) => (x.id === c.id ? { ...x, status: 'undone' as const } : x)), {
        id: `rebalance-fix:${c.id}@${at}`, at, rule: 'rebalance', key: `rebalance-fix:${c.id}`,
        before: {}, after: {}, status: 'info',
        reason: `Ausgleich zurückgenommen (${why}): ${c.reason}`,
      }],
    }
    added.push(state.log[state.log.length - 1])
  }

  // 1. Days edited by hand: the manual edit wins, the engine's addition there is void.
  for (const c of [...state.log].reverse()) {
    if (c.rule === 'rebalance' && c.status === 'active' && Object.keys(c.after).some((d) => manual[d])) {
      takeBack(c, 'Tag von dir geändert')
    }
  }

  // 2. Too much added this week for what is actually missing.
  if (week) {
    const vetoKey = `rebalance:${week.start}`
    const active = () => state.log.filter((c) => c.status === 'active' && c.rule === 'rebalance' && c.vetoKey === vetoKey)
    if (active().length) {
      const base = effectiveSessions(manual, withoutRebalance(state), pz({ today, pauses }))
      const plannedOn = (d: string) => { const s = base.find((x) => x.date === d); return s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0 }
      const kmOn = (d: string) => runs.filter((r) => r.date === d).reduce((t, r) => t + r.km, 0)
      const past = weekDates(week).filter((d) => d < today && d >= firstPlanStart() && isSynced(d, syncedThrough))
      const missing = Math.max(0, past.reduce((t, d) => t + plannedOn(d) - kmOn(d), 0))
      // Only additions on days still ahead are taken back; past days stay as they were planned.
      const revertible = () => active().filter((c) => Object.keys(c.after).every((d) => d >= today))
      while (revertible().length) {
        const addedKm = active().reduce((t, c) => t + (c.addedKm ?? 0), 0)
        if (addedKm - missing < MIN_REBALANCE_KM) break
        const c = revertible()[revertible().length - 1]
        // Extra km run since the change → the week caught up; otherwise a run arrived with a later sync.
        const changeDay = c.key.slice(vetoKey.length + 1)
        const extra = past.filter((d) => d >= changeDay).reduce((t, d) => t + Math.max(0, kmOn(d) - plannedOn(d)), 0)
        takeBack(c, extra >= MIN_REBALANCE_KM ? 'Woche schon aufgeholt, mehr gelaufen als geplant' : 'Lauf nachträglich synchronisiert')
      }
    }
  }
  return { state, added }
}

// Engine overrides without active rebalance additions: the base that manual edits work on.
export function withoutRebalance(state: EngineState): Overrides {
  const overrides = { ...state.overrides }
  for (const c of [...state.log].reverse()) {
    if (c.rule !== 'rebalance' || c.status !== 'active') continue
    for (const d of Object.keys(c.after)) {
      const prev = c.before[d]
      if (prev) overrides[d] = prev
      else delete overrides[d]
    }
  }
  return overrides
}

// ─── Rule: missed km of the current week go to its remaining easy days ───────

function rebalance({ today, at, manual, state, runs, fitness, syncedThrough, pauses }: EngineInput): EngineChange[] {
  const r = rulesFor(today)
  if (!r.rebalance) return []                                   // the template drops missed km
  if (tired(fitness, r)) return []                              // no extra km while tired
  const week = weekOf(today)
  if (!week || week.taper || isEasyWeek(week) || week.light || insertedRecoveryWeek(state, week.start) || week.end < firstPlanStart()) return []
  if (weekDates(week).some((d) => inPauseWindow(d, pz({ today, pauses })))) return []   // Krank/Pause: no make-up km
  const vetoKey = `rebalance:${week.start}`
  const key = `${vetoKey}:${today}`
  if (state.vetoes.includes(vetoKey) || state.log.some((c) => c.key === key)) return []

  const sessions = effectiveSessions(manual, state.overrides, pz({ today, pauses }))
  const at_ = (d: string) => sessions.find((x) => x.date === d)
  const kmOn = (d: string) => runs.filter((r) => r.date === d).reduce((t, r) => t + r.km, 0)
  const plannedOn = (d: string) => { const s = at_(d); return s && s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0 }
  const dates = weekDates(week)

  // Net missing km of the past days (extra km on other days count against it), minus what
  // this rule already added this week.
  const past = dates.filter((d) => d < today && d >= firstPlanStart() && isSynced(d, syncedThrough))
  const missing = Math.max(0, past.reduce((t, d) => t + plannedOn(d) - kmOn(d), 0))
  const already = state.log
    .filter((c) => c.status === 'active' && c.rule === 'rebalance' && c.vetoKey === vetoKey)
    .reduce((t, c) => t + (c.addedKm ?? 0), 0)
  const open = Math.round((missing - already) * 2) / 2
  if (open < MIN_REBALANCE_KM) return []

  // No extra km the day before a test or event.
  const candidates = dates.filter((d) => d >= today && !manual[d] && kmOn(d) === 0 && canTakeExtra(at_(d), d) && !at_(day(d, 1))?.test && !at_(day(d, 1))?.anchor)
  const add = new Map<string, number>()
  let left = open
  while (left >= 0.5) {
    const fit = candidates
      .filter((d) => plannedOn(d) + (add.get(d) ?? 0) + 0.5 <= maxKm(d))
      .sort((a, b) => (add.get(a) ?? 0) / plannedOn(a) - (add.get(b) ?? 0) / plannedOn(b))
    if (!fit.length) break
    add.set(fit[0], (add.get(fit[0]) ?? 0) + 0.5)
    left -= 0.5
  }
  if (!add.size) return []

  const after: Record<string, PlanSession> = {}
  for (const [d, km] of [...add].sort(([a], [b]) => a.localeCompare(b))) {
    const s = at_(d)!
    after[d] = { ...s, km: Math.round(((s.km ?? 0) + km) * 10) / 10, notes: join(s.notes, `+${fmtKm(km)} km Ausgleich`) }
  }
  const placed = open - left
  const from = past.filter((d) => plannedOn(d) > kmOn(d)).map(dayLabel).join(', ')
  return [{
    id: `${key}@${at}`, at, rule: 'rebalance', key, vetoKey, addedKm: placed, status: 'active',
    before: Object.fromEntries(Object.keys(after).map((d) => [d, state.overrides[d] ?? null])),
    after,
    reason: `${fmtKm(open)} km aus ${from || 'dieser Woche'} verteilt: ` +
      Object.keys(after).map((d) => `+${fmtKm(add.get(d)!)} km ${dayLabel(d)}`).join(', ') +
      (left >= 0.5 ? `; ${fmtKm(left)} km passen nicht (lockere Tage am Limit)` : ''),
  }]
}

// ─── Rule: HR cap reminder for easy runs ──────────────────────────────────────

// Two of the last three easy runs above the Z2 cap → the coming week's easy runs carry a note.
function hrCap({ today, at, manual, state, runs, pauses }: EngineInput): EngineChange[] {
  const cap = hrZones()[1].max
  const monday = format(startOfWeek(parseISO(today), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const vetoKey = `hr-cap:${monday}`
  if (state.vetoes.includes(vetoKey)) return []
  const since = day(today, -HR_CAP_DAYS)
  if (state.log.some((c) => c.rule === 'hr-cap' && c.key.slice('hr-cap:'.length) > since)) return []

  const sessions = effectiveSessions(manual, state.overrides, pz({ today, pauses }))
  const isEasy = (s: PlanSession) => (s.type === 'easy' || s.type === 'recovery') && !s.pace
  const past = sessions.filter((s) => s.date >= since && s.date < today && s.type !== 'rest')
  const matched = matchSessionRuns(past, runs)
  const easyRuns = past.filter(isEasy).map((s) => matched.get(s.date)).filter((r): r is DatedRun => !!r && r.avgHr != null)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  const high = easyRuns.filter((r) => r.avgHr! > cap)
  if (high.length < 2) return []

  const note = `HF-Deckel ${cap}: Tempo rausnehmen (eher ${fmtPace(paceToS(blockPaces(today).easy) + 15)}/km)`
  const upcoming = sessions.filter((s) => s.date >= today && s.date < day(today, HR_CAP_DAYS) && isEasy(s) &&
    !manual[s.date] && !runs.some((r) => r.date === s.date) && !s.notes?.startsWith('HF-Deckel'))
  if (!upcoming.length) return []
  const after = Object.fromEntries(upcoming.map((s) => [s.date, { ...s, notes: join(note, s.notes) }]))
  const key = `hr-cap:${today}`
  return [{
    id: `${key}@${at}`, at, rule: 'hr-cap', key, vetoKey, status: 'active',
    before: Object.fromEntries(upcoming.map((s) => [s.date, state.overrides[s.date] ?? null])), after,
    reason: `Lockere Läufe zu hart (Ø HF ${high.map((r) => r.avgHr).join(', ')} über ${cap}): Hinweis für ${upcoming.length} lockere Einheiten bis ${dayLabel(upcoming[upcoming.length - 1].date)}`,
  }]
}

// ─── Rule: race pace recalibration (the plan's own Generalprobe rule) ─────────

// The latest long race-pace block decides: HR ≥ the race's 'too hard' limit (marathon 175, raceHr) or clearly slow → remaining race-pace
// sessions move to the fallback pace; otherwise an info entry. Never faster than the goal.
function recalibrate({ today, at, manual, state, runs, pauses }: EngineInput): EngineChange[] {
  const race = raceOf(today)
  const { cap: RACE_HR_OK, hard: RACE_HR_SLOW } = raceHr(race.distanceKm)
  const goal = fmtPace(race.goalPaceS)
  const fallback = fmtPace(race.fallbackPaceS)
  const sessions = effectiveSessions(manual, state.overrides, pz({ today, pauses }))
  const recent = sessions.filter((s) => s.date >= day(today, -RECAL_DAYS - 1) && s.date < today && s.type !== 'rest')
  const matched = matchSessionRuns(recent, runs)
  const block = recent
    .filter((s) => s.key && s.type !== 'race' && s.pace === goal && qualityKm(s) >= MIN_BLOCK_KM && s.date >= day(today, -RECAL_DAYS))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => { const r = matched.get(s.date); return { s, b: r ? qualityBlock(s, r) : null } })
    .find((x) => x.b)
  if (!block) return []
  const { s, b } = block as { s: PlanSession; b: NonNullable<ReturnType<typeof qualityBlock>> }
  const key = `recalibrate:${s.date}`
  if (state.vetoes.includes(key) || state.log.some((c) => c.key === key && c.status !== 'undone')) return []

  const deltaS = Math.round(b.paceS - race.goalPaceS)
  // Not run at race pace at all (e.g. too tired, ran it easy): no verdict on the goal pace.
  if (!blockAttempted(s.pace, b.paceS)) {
    return [{ id: `${key}@${at}`, at, rule: 'recalibrate', key, before: {}, after: {}, status: 'info',
      reason: `${s.title} am ${dayLabel(s.date)}: nicht im Renntempo gelaufen (${fmtPace(b.paceS)} statt ${s.pace}) – keine Neubewertung, der nächste Test entscheidet.` }]
  }
  const seen = `${s.title} am ${dayLabel(s.date)}: ${b.km} km in ${fmtPace(b.paceS)} bei HF ${b.hr ?? '–'}`
  const info = (text: string): EngineChange[] =>
    [{ id: `${key}@${at}`, at, rule: 'recalibrate', key, before: {}, after: {}, status: 'info', reason: `${seen}: ${text}` }]

  const slow = (b.hr != null && b.hr >= RACE_HR_SLOW) || deltaS > PACE_SLOW_S
  if (!slow) {
    // Faster than goal pace is fine too: the goal stays, the block shows reserve.
    if (b.hr != null && b.hr < RACE_HR_OK && deltaS <= 5) return info(`auf ${fmtClock(race.goalS)}-Kurs.`)
    if (b.hr == null) return info(deltaS <= 5 ? 'Tempo im Ziel, keine Pulsdaten im Block.' : 'keine Pulsdaten im Block, Tempo entscheidet.')
    return info(`Grenzbereich, ${s.test ? `${fmtClock(race.goalS)} offen, vorsichtig anlaufen` : 'der nächste Test entscheidet'}.`)
  }

  const targets = sessions.filter((x) => x.date >= today && x.pace === goal && x.type !== 'race' &&
    !manual[x.date] && !runs.some((r) => r.date === x.date))
  const why = b.hr != null && b.hr >= RACE_HR_SLOW ? `Block-HF ${b.hr}` : `Block ${deltaS} s/km langsamer`
  const plan = `Ziel ${fmtClock(race.fallbackS)}: im Rennen ${fallback} anlaufen.`
  if (!targets.length) return info(`${why}. ${plan}`)
  const after = Object.fromEntries(targets.map((x) => [x.date, {
    ...x, pace: fallback,
    notes: join(`Tempo neu kalibriert (${why})`, x.notes?.split(`@ ${goal}`).join(`@ ${fallback}`)),
  }]))
  return [{
    id: `${key}@${at}`, at, rule: 'recalibrate', key, status: 'active',
    before: Object.fromEntries(targets.map((x) => [x.date, state.overrides[x.date] ?? null])), after,
    reason: `${seen} → ${targets.length} Renntempo-Einheiten auf ${fallback}. ${plan}`,
  }]
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

export function undoChange(state: EngineState, id: string): EngineState | { error: string } {
  const i = state.log.findIndex((c) => c.id === id)
  const change = state.log[i]
  if (!change || change.status !== 'active') return { error: 'Diese Änderung kann nicht zurückgenommen werden.' }
  const dates = Object.keys(change.after)
  const newer = state.log.slice(i + 1).find((c) => c.status === 'active' && Object.keys(c.after).some((d) => dates.includes(d)))
  if (newer) return { error: 'Erst die neuere Änderung an diesen Tagen zurücknehmen.' }

  const overrides = { ...state.overrides }
  for (const d of dates) {
    const prev = change.before[d]
    if (prev) overrides[d] = prev
    else delete overrides[d]
  }
  return {
    overrides,
    log: state.log.map((c) => (c.id === id ? { ...c, status: 'undone' as const } : c)),
    vetoes: [...new Set([...state.vetoes, change.vetoKey ?? change.key])],
  }
}
