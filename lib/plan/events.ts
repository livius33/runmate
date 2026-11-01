// Minor races inside a generated block (07-16): a race from the Saison page becomes a fixed day, and the days around it
// follow fixed rules by its role (research modifiers.md §5.2, convention): Renntempo-Test, Aufbaurennen, einfach
// mitlaufen. Applied when the block is registered, never stored in it — removing the race gives the frozen block back.
// Days only get easier or shorter. A hand-written block is never changed. Pure.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { distanceOf, type EventRole, type SeasonGoal } from '@/lib/season/goals'
import { fmtKm } from './format'
import { formatNotes } from './structure'
import type { PlanSession, TrainingBlock } from './types'

export const EVENT_RULES = {
  taperGuardDays: 9,            // TAPER_DAYS of the engine: no minor race this close to the goal race
  gapWarnDays: { other: 14, marathon: 21 },   // d ≥ 10 km closer than this to the goal race: warning
  gapWarnMinKm: 10,
  testDaysBefore: 21,           // default role 'test' this close to the goal race
  buildMinKm: 15,               // default role 'build' from this distance
  lightMinKm: 15,               // the race week counts as light from this distance (or ½ the goal distance)
  dayBeforeMaxKm: 8,
  dayAfterMaxKm: 10,
  longShare: 0.7,               // a long run around the race keeps this share of its km
  testPostDays: 2,
  weekOverMax: 0,               // the race week never exceeds its planned km (race km count; the generator's own rule)
  minRunKm: 3,
  funLongFromKm: 18,
  preEasy: { short: 2, half: 3, long: 4 },
  postPerKm: 3.5,
  postMin: 2,
  lightShare: 0.5,
}
export type EventRules = typeof EVENT_RULES

// The block's method may change some values (07-18, research modifiers.md 5.3); the rest are the defaults above.
export const eventRules = (b: TrainingBlock): EventRules => ({ ...EVENT_RULES, ...b.engine?.events })

export const ROLE_LABEL: Record<EventRole, string> = { test: 'Renntempo-Test', build: 'Aufbaurennen', fun: 'einfach mitlaufen' }

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const dm = (d: string) => format(parseISO(d), 'd.M.')
const r1 = (n: number) => Math.round(n * 10) / 10
const fmtPace = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`
const isRun = (s?: PlanSession): s is PlanSession & { km: number } => !!s && s.type !== 'rest' && s.type !== 'race' && (s.km ?? 0) > 0
const isHard = (s?: PlanSession) => !!s && (s.key || s.type === 'tempo' || s.type === 'intervals' || (s.type === 'long' && (s.km ?? 0) >= 25))

export const preEasyDays = (d: number, r: EventRules = EVENT_RULES) => (d <= 10 ? r.preEasy.short : d <= 21.1 ? r.preEasy.half : r.preEasy.long)
export const postEasyDays = (d: number, r: EventRules = EVENT_RULES) => Math.max(r.postMin, Math.round(d / r.postPerKm))

// Days before the goal race (positive = earlier).
const daysBefore = (g: SeasonGoal, b: TrainingBlock) => differenceInCalendarDays(parseISO(b.race.date), parseISO(g.date))
export const isGenerated = (b: TrainingBlock) => !b.handWritten
export const inBlock = (g: SeasonGoal, b: TrainingBlock) => g.date >= b.planStart && g.date < b.race.date

// The generated block a minor race falls into (null: a hand-written block or no block — then it is not planned).
export const eventBlock = (g: SeasonGoal, list: TrainingBlock[]) =>
  g.priority === 'B' && !g.fromPlan ? list.find((b) => isGenerated(b) && inBlock(g, b)) ?? null : null

export function defaultRole(g: SeasonGoal, b: TrainingBlock): EventRole {
  const d = distanceOf(g) ?? 0
  const r = eventRules(b)
  if (daysBefore(g, b) <= r.testDaysBefore) return 'test'
  if (d >= r.buildMinKm) return 'build'
  return 'fun'
}
export const roleOf = (g: SeasonGoal, b: TrainingBlock) => g.role ?? defaultRole(g, b)

// German error (the race is not planned), or null.
export function eventError(g: SeasonGoal, b: TrainingBlock): string | null {
  const n = daysBefore(g, b)
  if (n >= 1 && n <= EVENT_RULES.taperGuardDays) return `Zu nah an ${b.race.name}: in den letzten ${EVENT_RULES.taperGuardDays} Tagen davor plant Runmate kein Rennen ein.`
  if (!distanceOf(g)) return 'Für die Planung braucht das Rennen eine Strecke.'
  return null
}

export function eventWarning(g: SeasonGoal, b: TrainingBlock): string | null {
  const d = distanceOf(g) ?? 0
  const gap = b.race.distanceKm > 30 ? EVENT_RULES.gapWarnDays.marathon : EVENT_RULES.gapWarnDays.other
  const n = daysBefore(g, b)
  if (d >= EVENT_RULES.gapWarnMinKm && n > EVENT_RULES.taperGuardDays && n < gap) return `Nur ${n} Tage vor ${b.race.name} – das kostet Frische für das Hauptrennen.`
  return null
}

// One sentence: what the role does to the week.
export function eventEffect(role: EventRole, d: number, r: EventRules = EVENT_RULES): string {
  const days = (n: number) => `${n} ${n === 1 ? 'lockerer Tag' : 'lockere Tage'}`
  if (role === 'test') return `Testrennen im Zielrenntempo; ${days(preEasyDays(d, r))} davor, ${r.testPostDays} danach, die anderen Schlüsseleinheiten der Woche werden locker. Zählt für Plan A/B.`
  if (role === 'build') return `Mit voller Kraft; ersetzt die Schlüsseleinheiten der Woche, ${days(preEasyDays(d, r))} davor und ${postEasyDays(d, r)} danach.`
  return 'Locker mitlaufen statt der geplanten Einheit; nur der Tag davor wird ruhig.'
}

function raceDay(g: SeasonGoal, b: TrainingBlock, role: EventRole, d: number): PlanSession {
  const base = { date: g.date, title: g.name, anchor: true as const }
  if (role === 'fun') {
    const easy = b.paces?.easy ?? fmtPace(b.race.goalPaceS + 80)
    return { ...base, type: d >= EVENT_RULES.funLongFromKm ? 'long' : 'easy', km: r1(d), notes: `Einfach mitlaufen, locker (ca. ${easy}/km).` }
  }
  const pace = role === 'test' ? fmtPace(g.paceS ?? b.race.goalPaceS) : g.goalS ? fmtPace(g.goalS / d) : null
  const notes = pace
    ? formatNotes({ prefix: '', warmKm: 3, warmWord: 'ein', reps: 1, repKm: r1(d), pace, recKm: 0, recWord: 'Trab', coolKm: 2, coolWord: 'aus',
      suffix: role === 'test' ? '. Testrennen: zählt für Plan A/B.' : '. Aufbaurennen mit voller Kraft.' })
    : `3 ein → ${fmtKm(r1(d))} km Rennen mit voller Kraft → 2 aus.`
  return { ...base, type: 'tempo', km: r1(d + 5), key: true, ...(pace ? { pace } : {}), ...(role === 'test' ? { test: 'Testrennen' } : {}), notes }
}

// The block with its minor races applied. Races outside the block, in its taper guard, without a distance, or in a
// non-generated block are ignored (the Saison page explains why).
export function applyEvents(block: TrainingBlock, goals: SeasonGoal[]): TrainingBlock {
  if (!isGenerated(block)) return block
  const R = eventRules(block)
  const races = goals.filter((g) => g.priority === 'B' && !g.fromPlan && inBlock(g, block) && !eventError(g, block))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!races.length) return block

  const byDate = new Map(block.sessions.map((s) => [s.date, s]))
  const planned = new Map(block.sessions.map((s) => [s.date, s]))
  const fixed = new Set(block.sessions.filter((s) => s.anchor || s.type === 'race').map((s) => s.date))
  const lightWeeks = new Set<string>()
  const why = (g: SeasonGoal) => `Locker wegen ${g.name} am ${dm(g.date)}.`
  // Easier or shorter only; never a fixed day.
  const soften = (date: string, g: SeasonGoal, opts: { maxKm?: number; recovery?: boolean } = {}) => {
    const s = byDate.get(date)
    if (!isRun(s) || fixed.has(date)) return
    const km = Math.max(EVENT_RULES.minRunKm, Math.min(s.km, opts.maxKm ?? Infinity, s.type === 'long' ? r1(Math.floor(s.km * EVENT_RULES.longShare * 2) / 2) : Infinity))
    const hard = isHard(s)
    if (!hard && km >= s.km && !opts.recovery) return
    byDate.set(date, {
      date, type: opts.recovery ? 'recovery' : 'easy', km: Math.min(km, s.km),
      title: opts.recovery ? 'Sehr lockerer Lauf' : 'Lockerer Lauf', notes: `Zone 2. ${why(g)}`,
    })
  }

  for (const g of races) {
    const d = distanceOf(g)!
    const role = roleOf(g, block)
    byDate.set(g.date, raceDay(g, block, role, d))
    fixed.add(g.date)
    const week = block.weeks.find((w) => w.start <= g.date && g.date <= w.end)
    if (role === 'fun') {
      const before = byDate.get(day(g.date, -1))
      if (isHard(before)) soften(day(g.date, -1), g)
      continue
    }
    for (let i = 1; i <= preEasyDays(d, R); i++) soften(day(g.date, -i), g, i === 1 ? { maxKm: EVENT_RULES.dayBeforeMaxKm } : {})
    const post = role === 'test' ? R.testPostDays : postEasyDays(d, R)
    for (let i = 1; i <= post; i++) soften(day(g.date, i), g, i === 1 ? { maxKm: EVENT_RULES.dayAfterMaxKm, recovery: true } : {})
    if (week) for (let x = week.start; x <= week.end; x = day(x, 1)) if (byDate.get(x)?.key && x !== g.date) soften(x, g)
    if (week && (d >= R.lightMinKm || d >= block.race.distanceKm * R.lightShare)) lightWeeks.add(week.start)
  }

  // Each race week ≤ its planned km: cut the longest non-fixed run days in 0,5-km steps.
  for (const g of races) {
    const week = block.weeks.find((w) => w.start <= g.date && g.date <= w.end)
    if (!week) continue
    const dates = Array.from({ length: 7 }, (_, i) => day(week.start, i))
    const km = (m: Map<string, PlanSession>) => dates.reduce((t, x) => t + (isRun(m.get(x)) ? m.get(x)!.km! : 0), 0)
    const cap = km(planned) * (1 + EVENT_RULES.weekOverMax)
    while (km(byDate) > cap + 1e-9) {
      const [x] = dates.filter((x) => !fixed.has(x) && isRun(byDate.get(x)) && byDate.get(x)!.km! - 0.5 >= EVENT_RULES.minRunKm)
        .sort((a, c) => byDate.get(c)!.km! - byDate.get(a)!.km! || a.localeCompare(c))
      if (!x) {
        // Every run is at its minimum (two races in one week): the shortest becomes a rest day. Only the races
        // themselves can keep the week above its plan.
        const [y] = dates.filter((x) => !fixed.has(x) && isRun(byDate.get(x))).sort((a, c) => byDate.get(a)!.km! - byDate.get(c)!.km! || a.localeCompare(c))
        if (!y) break
        byDate.set(y, { date: y, type: 'rest', title: 'Ruhetag', notes: why(g) })
        continue
      }
      const s = byDate.get(x)!
      byDate.set(x, { ...s, km: r1(s.km! - 0.5), type: s.type === 'tempo' || s.type === 'intervals' ? 'easy' : s.type, key: false, notes: `Zone 2. ${why(g)}` })
    }
  }

  return {
    ...block,
    sessions: [...byDate.values()].sort((a, c) => a.date.localeCompare(c.date)),
    weeks: block.weeks.map((w) => (lightWeeks.has(w.start) ? { ...w, light: true } : w)),
  }
}
