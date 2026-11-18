// Rebuild the rest of a live block when the runner asks for it (v1.1 10-02): a new goal time, race date, method or
// weekdays, or simply "bring the plan to where I am". The rest is a fresh generator run from next Monday, so every limit
// of a new plan holds; the weeks before stay as stored. Rules: methodologies/research/plan-changes.md §2. Pure.
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'
import { clockText, type SeasonGoal } from '@/lib/season/goals'
import { WEEKDAYS, type AthleteProfile } from './athlete-profile'
import type { Overrides } from './effective'
import { GOAL_DISTANCE, generateDraft, type Draft, type DraftOverrides } from './generator/draft'
import { freezeDraft } from './generator/freeze'
import { measureInputs, type MeasuredInputs, type RunRow } from './generator/inputs'
import { fmtPace } from './generator/paces'
import type { Methodology } from './methodology/schema'
import { pauseEnd, type Pause } from './pause'
import type { PlanSession, PlanWeek, TrainingBlock } from './types'

export const REBUILD = {
  baseWeeks: 2,             // B = mean of the last 2 completed weeks of runs (adaptation.md §5)
  pauseLookbackDays: 28,    // a marked pause this recent sets the base (= RETURN_RULES.lookbackDays)
  minPauseDays: 4,          // = RETURN_RULES.recoveryDays
  returnShare: 0.7,         // of the level before the pause (= RETURN_RULES.week1Share)
  longReturnShare: 0.5,     // from longPauseDays paused days
  longPauseDays: 28,
  dataWeeks: 4,             // base data: runs in ≥ dataGood of the last dataWeeks completed weeks
  dataGood: 3,
  minBuildWeeks: 3,         // generator's hard floor: taper + 3 weeks
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const monday = (d: string) => ymd(startOfWeek(parseISO(d), { weekStartsOn: 1 }))
const plus = (d: string, n: number) => ymd(addDays(parseISO(d), n))
const half = (n: number) => Math.round(n * 2) / 2
const r1 = (n: number) => Math.round(n * 10) / 10
const num = (n: number) => String(r1(n)).replace('.', ',')
const dm = (d: string) => format(parseISO(d), 'd.M.')
const dmy = (d: string) => format(parseISO(d), 'd.M.yyyy')

// The first day a rebuild may change: the Monday after today, or the block's start when it has not begun.
export function cutOf(today: string, block: Pick<TrainingBlock, 'planStart'>) {
  const next = plus(monday(today), 7)
  return next > block.planStart ? next : block.planStart
}

// ── Base ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface RebuildBase {
  km: number                       // 0 = no recommendation
  source: 'runs2' | 'return'
  runsKm: number                   // mean of the last 2 completed weeks
  beforeKm: number | null          // level before the pause
  pauseDays: number | null
  share: number | null
  text: string
}

export function rebuildBase({ runs, pauses, today }: { runs: RunRow[]; pauses: Pause[]; today: string }): RebuildBase {
  const weekKm = (from: string) => runs.filter((r) => r.date >= from && r.date < plus(from, 7)).reduce((t, r) => t + r.distanceM / 1000, 0)
  const meanBefore = (mon: string) => Array.from({ length: REBUILD.baseWeeks }, (_, i) => weekKm(plus(mon, -7 * (i + 1)))).reduce((a, b) => a + b, 0) / REBUILD.baseWeeks
  const runsKm = half(meanBefore(monday(today)))
  const since = plus(today, -REBUILD.pauseLookbackDays)
  const p = pauses.filter((x) => x.from <= today && pauseEnd(x, today) >= since).sort((a, b) => a.from.localeCompare(b.from)).pop()
  const days = p ? differenceInCalendarDays(parseISO(pauseEnd(p, today)), parseISO(p.from)) + 1 : 0
  const plain: RebuildBase = { km: runsKm, source: 'runs2', runsKm, beforeKm: null, pauseDays: null, share: null,
    text: `Schnitt deiner letzten ${REBUILD.baseWeeks} Wochen: ${num(runsKm)} km pro Woche.` }
  if (!p || days < REBUILD.minPauseDays) return plain
  const beforeKm = half(meanBefore(monday(p.from)))
  const share = days >= REBUILD.longPauseDays ? REBUILD.longReturnShare : REBUILD.returnShare
  const km = half(share * beforeKm)
  if (km <= runsKm) return { ...plain, beforeKm, pauseDays: days, share }
  return { km, source: 'return', runsKm, beforeKm, pauseDays: days, share,
    text: `Wiedereinstieg nach ${days} Tagen Pause: ${Math.round(share * 100)} % von ${num(beforeKm)} km davor = ${num(km)} km pro Woche.` }
}

// ── Data check ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type DataState = 'good' | 'thin' | 'missing'
export interface DataCheck {
  base: { state: DataState; weeksWithRuns: number; text: string }
  goal: { state: 'checked' | 'unchecked'; text: string }
  long: { state: 'good' | 'missing'; km: number; text: string }
}

export function dataCheck(a: { runs: RunRow[]; today: string; base: RebuildBase; measured: Pick<MeasuredInputs, 'recentRace' | 'longest30Km'>; profile: AthleteProfile | null }): DataCheck {
  const mon = monday(a.today)
  const n = Array.from({ length: REBUILD.dataWeeks }, (_, i) => plus(mon, -7 * (i + 1)))
    .filter((from) => a.runs.some((r) => r.date >= from && r.date < plus(from, 7) && r.distanceM > 0)).length
  const of = `${n} der letzten ${REBUILD.dataWeeks} Wochen`
  const base: DataCheck['base'] = a.base.km <= 0
    ? { state: 'missing', weeksWithRuns: n, text: n ? `Läufe nur in ${of}: bitte deinen Wochenumfang eintragen.` : `Kein Lauf in den letzten ${REBUILD.dataWeeks} Wochen: bitte deinen Wochenumfang eintragen.` }
    : a.base.source === 'return'
      ? { state: 'thin', weeksWithRuns: n, text: `Nach der Pause geschätzt (${num(a.base.km)} km pro Woche): bitte prüfen oder selbst eintragen.` }
      : n >= REBUILD.dataGood
        ? { state: 'good', weeksWithRuns: n, text: `Läufe in ${of}: der Wochenumfang ist gemessen.` }
        : { state: 'thin', weeksWithRuns: n, text: `Läufe nur in ${of}: bitte den Wochenumfang prüfen oder selbst eintragen.` }
  const race = a.measured.recentRace
  const goal: DataCheck['goal'] = race
    ? { state: 'checked', text: `Zielzeit prüfbar: Wettkampf vom ${dmy(race.date)} (${num(race.distanceKm)} km in ${clockText(race.timeS)}).` }
    : a.profile?.thresholdPaceS
      ? { state: 'checked', text: `Zielzeit prüfbar: Schwellentest im Profil (${fmtPace(a.profile.thresholdPaceS)}/km).` }
      : { state: 'unchecked', text: 'Zielzeit nicht prüfbar: kein Wettkampf in den letzten 6 Monaten und kein Schwellentest. Sie gilt so, wie du sie einträgst.' }
  const km = a.measured.longest30Km
  const long: DataCheck['long'] = km > 0
    ? { state: 'good', km, text: `Längster Lauf der letzten 30 Tage: ${num(km)} km.` }
    : { state: 'missing', km: 0, text: 'Kein Lauf in den letzten 30 Tagen: der Longrun beginnt vorsichtig.' }
  return { base, goal, long }
}

// ── Splice, totals, preview ────────────────────────────────────────────────────────────────────────────────────────
// Weeks and sessions of `old` before `cut`, `fresh` from there (fresh starts on `cut`).
export function spliceBlock(old: TrainingBlock, fresh: TrainingBlock, cut: string): TrainingBlock {
  return {
    ...fresh,
    planStart: old.planStart < fresh.planStart ? old.planStart : fresh.planStart,
    weeks: [...old.weeks.filter((w) => w.start < cut), ...fresh.weeks.filter((w) => w.start >= cut)],
    sessions: [...old.sessions.filter((s) => s.date < cut), ...fresh.sessions.filter((s) => s.date >= cut)],
  }
}

export interface Totals {
  raceDate: string
  goalS: number
  weeks: number                    // weeks from the cut to the race, race week included
  peakKm: number
  longestKm: number
  taperStart: string | null
  racePace: string
  easyPace: string | null
  restKm: number                   // planned km from the cut to the race week
}
export interface WeekSide { km: number; kind: string; keys: string[] }
export interface WeekRow { start: string; kw: number; before: WeekSide | null; after: WeekSide | null }

const toRace = (b: TrainingBlock, cut: string) => b.weeks.filter((w) => w.start >= cut && w.start <= b.race.date)
const weekKind = (w: PlanWeek) => (w.recovery ? 'Nach dem Rennen' : w.taper ? 'Taper' : w.cutback ? 'Erholung' : w.light ? 'Leicht' : 'Belastung')

export function totalsOf(b: TrainingBlock, cut: string): Totals {
  const weeks = toRace(b, cut)
  const longs = b.sessions.filter((s) => s.date >= cut && s.date < b.race.date && s.type === 'long').map((s) => s.km ?? 0)
  return {
    raceDate: b.race.date, goalS: b.race.goalS, weeks: weeks.length,
    peakKm: Math.max(0, ...weeks.map((w) => w.km)), longestKm: Math.max(0, ...longs),
    taperStart: weeks.find((w) => w.taper)?.start ?? null,
    racePace: b.paces?.race ?? fmtPace(b.race.goalPaceS), easyPace: b.paces?.easy ?? null,
    restKm: r1(weeks.reduce((t, w) => t + w.km, 0)),
  }
}

export function weekRows(old: TrainingBlock, next: TrainingBlock, cut: string): WeekRow[] {
  const side = (b: TrainingBlock, w?: PlanWeek): WeekSide | null => w
    ? { km: w.km, kind: weekKind(w), keys: b.sessions.filter((s) => s.date >= w.start && s.date <= w.end && (s.key || s.type === 'race')).map((s) => s.title) }
    : null
  const starts = [...new Set([...old.weeks, ...next.weeks].filter((w) => w.start >= cut).map((w) => w.start))].sort()
  return starts.map((start) => {
    const [a, b] = [old.weeks.find((w) => w.start === start), next.weeks.find((w) => w.start === start)]
    return { start, kw: (b ?? a)!.kw, before: side(old, a), after: side(next, b) }
  })
}

// Manual or engine edits a rebuild takes away: dates from the cut to the end of the old or the new block.
export function splitEdits(overrides: Overrides, from: string, to: string): { kept: Overrides; removed: Overrides } {
  const kept: Overrides = {}
  const removed: Overrides = {}
  for (const [d, s] of Object.entries(overrides)) (d >= from && d <= to ? removed : kept)[d] = s
  return { kept, removed }
}

// ── Rebuild ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface RebuildChange {
  goalS?: number | null
  raceDate?: string | null
  templateId?: string | null       // resolved by the caller; here it only says "the method changed"
  currentKm?: number | null        // typed base (overrides the measured one)
  peakKm?: number | null           // typed peak; null = back to the recommended one
}
export interface RebuildInput {
  block: TrainingBlock             // as stored (no events, no markers)
  goal: SeasonGoal                 // the block's Saison goal as stored
  change: RebuildChange
  template: Methodology            // the method the rest is built with
  templateLabel: string
  oldTemplateLabel: string | null
  profile: AthleteProfile | null   // the profile the rest is built with
  oldProfile: AthleteProfile | null
  carried: DraftOverrides          // what the runner set at go-live and still holds: provenKm, peakKm, goalS
  runs: RunRow[]
  plan: PlanSession[]              // effective plan (longest planned run before the cut)
  weeks: PlanWeek[]
  pauses: Pause[]
  others: TrainingBlock[]          // every other goal block (overlap after a later race date)
  today: string
}
export interface Rebuilt {
  ok: true
  cut: string
  block: TrainingBlock
  goal: SeasonGoal                 // the goal after the change
  draft: Draft
  base: RebuildBase
  data: DataCheck
  before: Totals
  after: Totals
  weeks: WeekRow[]
  reasons: string[]
  warnings: string[]
}
export type RebuildResult = Rebuilt | { ok: false; error: string; base?: RebuildBase; data?: DataCheck; needs?: 'currentKm' }

const WEEK_VIEW = 'Einzelne Tage änderst du in der Wochenansicht.'

// German sentence when the block can no longer be rebuilt, else null.
export function tooLate(template: Methodology, goal: Pick<SeasonGoal, 'kind' | 'date'>, cut: string): string | null {
  const distance = GOAL_DISTANCE[goal.kind]
  const T = distance ? template.phases.taper.weeks[distance] ?? 0 : 0
  const W = Math.floor(differenceInCalendarDays(parseISO(monday(goal.date)), parseISO(cut)) / 7) + 1
  if (W - T >= REBUILD.minBuildWeeks) return null
  return `Bis zum Rennen sind es ab dem ${dm(cut)} noch ${Math.max(0, W)} Wochen: zu kurz für einen neuen Aufbau (mindestens ${T + REBUILD.minBuildWeeks}). ${WEEK_VIEW}`
}

export function rebuild(a: RebuildInput): RebuildResult {
  const { block, today, change } = a
  if (block.base || block.handWritten) return { ok: false, error: 'Dieser Plan kommt nicht aus dem Generator und lässt sich hier nicht neu aufbauen.' }
  if (block.race.date <= today) return { ok: false, error: 'Das Rennen ist vorbei: ein neuer Plan beginnt unter „Neuer Plan“.' }
  const distance = GOAL_DISTANCE[a.goal.kind]
  if (!distance) return { ok: false, error: 'Für dieses Ziel gibt es keine Vorlage.' }
  const goal: SeasonGoal = { ...a.goal, date: change.raceDate ?? a.goal.date, goalS: change.goalS ?? a.carried.goalS ?? a.goal.goalS }
  if (goal.date <= today) return { ok: false, error: 'Das Renndatum muss in der Zukunft liegen.' }
  const cut = cutOf(today, block)

  const measured = measureInputs({ runs: a.runs, plan: a.plan, weeks: a.weeks, today, start: cut, distance })
  const base = rebuildBase(a)
  const data = dataCheck({ runs: a.runs, today, base, measured, profile: a.profile })
  const late = tooLate(a.template, goal, cut)
  if (late) return { ok: false, error: late, base, data }
  if (base.km <= 0 && change.currentKm == null) return { ok: false, error: data.base.text, base, data, needs: 'currentKm' }

  const draft = generateDraft({
    goal, template: a.template, start: cut, profile: a.profile,
    measured: { ...measured, currentKm: base.km, currentKmSource: base.source },
    overrides: { currentKm: change.currentKm ?? null, provenKm: a.carried.provenKm ?? null, peakKm: change.peakKm !== undefined ? change.peakKm : a.carried.peakKm ?? null },
  })
  if (!draft.ok) return { ok: false, error: draft.error, base, data }
  const next = spliceBlock(block, freezeDraft(draft, goal, a.templateLabel, a.template), cut)
  const clash = a.others.find((b) => b.id !== block.id && !b.base && next.planStart <= b.end && b.planStart <= next.end)
  if (clash) return { ok: false, error: `Überschneidet sich mit „${clash.race.name}“ (ab ${dmy(clash.planStart)}): das Rennen früher legen oder den anderen Plan verschieben.`, base, data }

  const before = totalsOf(block, cut)
  const after = totalsOf(next, cut)
  return {
    ok: true, cut, block: next, goal, draft, base, data, before, after, weeks: weekRows(block, next, cut),
    reasons: reasonsFor({ ...a, cut, draft, base, before, after }),
    warnings: [...draft.paces.warnings, ...draft.warnings.map((w) => w.text)],
  }
}

const dayNames = (days: number[]) => [...days].sort().map((d) => WEEKDAYS.find((w) => w.d === d)?.short ?? String(d)).join(', ')
const cap = (n: number | null) => (n == null ? 'ohne Grenze' : `${num(n)} km`)

// One sentence per difference, each with the numbers behind it.
function reasonsFor(a: RebuildInput & { cut: string; draft: Draft; base: RebuildBase; before: Totals; after: Totals }): string[] {
  const { before: o, after: n, change, draft } = a
  const out = [`Neu geplant ab Montag, ${dm(a.cut)}; alles davor bleibt, wie es war.`]
  out.push(change.currentKm != null
    ? `Grundlage: ${num(change.currentKm)} km pro Woche, von dir eingetragen${a.base.km > 0 ? ` (gemessen: ${num(a.base.km)} km)` : ''}.`
    : `Grundlage: ${a.base.text}`)
  if (n.goalS !== o.goalS || n.racePace !== o.racePace) {
    out.push(`Zielzeit ${clockText(o.goalS)} → ${clockText(n.goalS)}: Renntempo ${o.racePace} → ${n.racePace}/km`
      + (o.easyPace && n.easyPace && o.easyPace !== n.easyPace ? `, locker ${o.easyPace} → ${n.easyPace}/km.` : '.'))
  }
  if (n.raceDate !== o.raceDate) out.push(`Rennen ${dmy(o.raceDate)} → ${dmy(n.raceDate)}: ${o.weeks} → ${n.weeks} Wochen bis zum Rennen.`)
  if (change.templateId && a.oldTemplateLabel !== a.templateLabel) {
    out.push(`Methode: ${a.templateLabel}${a.oldTemplateLabel ? ` statt ${a.oldTemplateLabel}` : ''}. Schlüsseleinheiten und Umfangsverlauf folgen ihren Regeln.`)
  }
  const [p, q] = [a.oldProfile, a.profile]
  if (p && q) {
    if (dayNames(p.availableDays) !== dayNames(q.availableDays)) out.push(`Lauftage: ${dayNames(p.availableDays)} → ${dayNames(q.availableDays)} (${p.availableDays.length} → ${q.availableDays.length} pro Woche).`)
    if (p.longRunDay !== q.longRunDay && q.longRunDay) out.push(`Longrun: ${p.longRunDay ? dayNames([p.longRunDay]) : 'frei'} → ${dayNames([q.longRunDay])}.`)
    if (dayNames(p.qualityDays) !== dayNames(q.qualityDays) && q.qualityDays.length) out.push(`Tempotage: ${dayNames(p.qualityDays) || 'frei'} → ${dayNames(q.qualityDays)}.`)
    if (p.maxKmWeekday !== q.maxKmWeekday || p.maxKmWeekend !== q.maxKmWeekend) {
      out.push(`Längster Lauf pro Tag: Mo–Fr ${cap(p.maxKmWeekday)} → ${cap(q.maxKmWeekday)}, Sa–So ${cap(p.maxKmWeekend)} → ${cap(q.maxKmWeekend)}.`)
    }
  }
  if (Math.abs(n.peakKm - o.peakKm) >= 0.5) {
    const why = draft.skeleton.peak.why.slice(2).join(' ')
    out.push(`Spitze ${num(o.peakKm)} → ${num(n.peakKm)} km pro Woche.${why ? ` ${why}` : ''}`)
  }
  if (Math.abs(n.longestKm - o.longestKm) >= 0.5) {
    const l30 = draft.inputs.longest30Km.value ?? 0
    out.push(`Längster Longrun ${num(o.longestKm)} → ${num(n.longestKm)} km`
      + (l30 > 0 ? `: er wächst von deinem längsten Lauf der letzten 30 Tage (${num(l30)} km), nie mehr als 10 % auf einmal.` : '.'))
  }
  if (n.taperStart !== o.taperStart && n.taperStart) out.push(`Taper ab ${dm(n.taperStart)}${o.taperStart ? ` statt ${dm(o.taperStart)}` : ''}.`)
  out.push(Math.abs(n.restKm - o.restKm) < 0.5
    ? `Bis zum Rennen bleiben es ${num(n.restKm)} km.`
    : `Bis zum Rennen: ${num(o.restKm)} → ${num(n.restKm)} km (${n.restKm > o.restKm ? '+' : '−'}${num(Math.abs(n.restKm - o.restKm))} km).`)
  return out
}

// ── History and undo ───────────────────────────────────────────────────────────────────────────────────────────────
export interface RebuildUndo {
  block: TrainingBlock                                  // the stored block before
  templateId: string | null
  carried: DraftOverrides
  manual: Overrides                                     // removed edits
  engine: Overrides
  engineLog: string[]                                   // ids of engine changes the rebuild took back
  goal: { date: string; goalS: number | null } | null   // Saison goal before, when the rebuild changed it
  profile: AthleteProfile | null                        // profile before, when the rebuild changed it
}
export interface RebuildEntry {
  id: string
  at: string
  blockId: string
  cut: string
  title: string
  reasons: string[]
  before: Totals
  after: Totals
  removed: { manual: number; engine: number }
  status: 'active' | 'undone'
  undo: RebuildUndo | null                              // null once it can no longer be undone (older entries)
}

// What the entry is called in the history: the changed levers, or the plain refresh.
export function entryTitle(r: Rebuilt, a: Pick<RebuildInput, 'change' | 'templateLabel' | 'oldTemplateLabel' | 'profile' | 'oldProfile'>): string {
  const parts: string[] = []
  if (r.after.goalS !== r.before.goalS) parts.push(`Zielzeit ${clockText(r.before.goalS)} → ${clockText(r.after.goalS)}`)
  if (r.after.raceDate !== r.before.raceDate) parts.push(`Rennen ${dmy(r.before.raceDate)} → ${dmy(r.after.raceDate)}`)
  if (a.change.templateId && a.oldTemplateLabel !== a.templateLabel) parts.push(`Methode ${a.templateLabel}`)
  if (a.oldProfile && a.profile && JSON.stringify({ ...a.oldProfile, savedAt: null }) !== JSON.stringify({ ...a.profile, savedAt: null })) parts.push('Alltag')
  if (a.change.currentKm != null) parts.push(`Grundlage ${num(a.change.currentKm)} km`)
  if (a.change.peakKm != null) parts.push(`Spitze ${num(a.change.peakKm)} km`)
  return parts.length ? parts.join(' · ') : `Auf deinen Stand gebracht (${num(r.base.km)} km pro Woche)`
}

// The block after an undo: what has been planned up to next Monday stays, the old block returns from there. Before the
// cut of the rebuild that is the old block unchanged.
export function undoBlock(current: TrainingBlock, previous: TrainingBlock, today: string): { block: TrainingBlock; from: string } | { error: string } {
  const from = cutOf(today, previous)
  if (previous.race.date < from) return { error: 'Das Rennen des alten Plans liegt schon hinter dir: das lässt sich nicht mehr zurücknehmen.' }
  return { from, block: spliceBlock(current, previous, from) }
}

// Only the newest active rebuild of a block can be undone.
export const undoable = (entries: RebuildEntry[], e: RebuildEntry) =>
  e.status === 'active' && !!e.undo && entries.filter((x) => x.blockId === e.blockId && x.status === 'active').sort((a, b) => b.at.localeCompare(a.at))[0]?.id === e.id
