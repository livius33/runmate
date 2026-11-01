// The season: races and runs on a timeline. Main races (A) shape the season: between two of them
// there is a block (recovery, then build weeks). Minor races and runs (B) are shown inside the block
// they fall in. The race of a hand-written plan file (lib/plan/blocks.ts registerBuiltInBlocks) and the fixed events
// of its plan come from that file and cannot be edited; everything else is saved in the DB (settings 'season_goals')
// and edited on the Saison page. Pure.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { builtInBlocks } from '@/lib/plan/blocks'
import { paceToS, qualityKm } from '@/lib/plan/format'
import type { TrainingBlock } from '@/lib/plan/types'

export type GoalKind = 'marathon' | 'half' | '10k' | '5k' | 'backyard' | 'other'
export type Priority = 'A' | 'B'
export type EventRole = 'test' | 'build' | 'fun'   // Renntempo-Test · Aufbaurennen · einfach mitlaufen   // A = main race (blocks are planned around it), B = minor race or run

export interface SeasonGoal {
  id: string
  kind: GoalKind
  priority: Priority
  name: string
  date: string               // 'YYYY-MM-DD'
  confirmed: boolean         // false = placeholder date, not booked yet
  distanceKm: number | null  // only for 'other'
  goalS: number | null       // time goal; null = open
  loops: number | null       // backyard: loops to finish; null = open
  fromPlan?: boolean         // the race of a plan file and its events: read-only
  role?: EventRole           // minor race inside a generated block (07-16); undefined = the default (lib/plan/events.ts)
  paceS?: number | null      // Renntempo-Test: pace to run, s/km; null = the goal race's pace
}

export const BACKYARD_LOOP_KM = 6.706    // 4,167 mi, one loop per hour

export const DISTANCE_KM: Record<GoalKind, number | null> = {
  marathon: 42.195, half: 21.0975, '10k': 10, '5k': 5, backyard: null, other: null,
}
export const KIND_LABEL: Record<GoalKind, string> = {
  marathon: 'Marathon', half: 'Halbmarathon', '10k': '10 km', '5k': '5 km', backyard: 'Backyard Ultra', other: 'Anderer Lauf',
}
export const SEASON_KEY = 'season_goals'   // settings key: own goals only; plan-file races and events come from the plan file
export const KINDS = Object.keys(KIND_LABEL) as GoalKind[]
export const PRIORITY_LABEL: Record<Priority, string> = { A: 'Hauptrennen', B: 'Nebenrennen / Lauf' }
export const DEFAULT_PRIORITY: Record<GoalKind, Priority> = { marathon: 'A', half: 'A', '10k': 'B', '5k': 'B', backyard: 'A', other: 'B' }

// Easy weeks after a main race before the next build starts (a plan file: its own recovery block).
// Generated blocks carry these weeks after the race (07-22, research between-blocks.md §1: half 2 weeks at 50 / 80 %).
export const RECOVERY_WEEKS: Record<GoalKind, number> = { marathon: 3, half: 2, '10k': 1, '5k': 1, backyard: 3, other: 1 }
// Fewer build weeks than this before a main race: shown as a warning.
export const MIN_BUILD_WEEKS: Record<GoalKind, number> = { marathon: 16, half: 8, '10k': 6, '5k': 6, backyard: 12, other: 6 }

const GOAL_S = [10 * 60, 6 * 3600] as const   // sensible time goals: 10 min … 6 h
const LOOPS = [1, 100] as const
const DIST = [1, 250] as const

const kindOf = (km: number): GoalKind =>
  Math.abs(km - 42.2) < 0.3 ? 'marathon' : Math.abs(km - 21.1) < 0.2 ? 'half' : Math.abs(km - 10) < 0.2 ? '10k' : Math.abs(km - 5) < 0.2 ? '5k' : 'other'

const handWritten = () => builtInBlocks().filter((b) => b.handWritten)

// The main race of each plan file (read-only on the Saison page).
export function planRaceGoals(list: TrainingBlock[] = handWritten()): SeasonGoal[] {
  return list.map((b) => {
    const kind = kindOf(b.race.distanceKm)
    return { id: b.goalId, kind, priority: 'A', name: b.race.name, date: b.race.date, confirmed: true,
      distanceKm: kind === 'other' ? b.race.distanceKm : null, goalS: b.race.goalS, loops: null, fromPlan: true }
  })
}

// Fixed events of the plan files (anchor sessions), shown as minor races: the race distance is the session's block
// ('21,1 km @ 4:23'), the goal its planned pace.
export function planEvents(list: TrainingBlock[] = handWritten()): SeasonGoal[] {
  return list.flatMap((b) => b.sessions.filter((s) => s.anchor)).map((s) => {
    const race = qualityKm(s) || s.km || 0
    const kind = kindOf(race) === 'marathon' ? 'other' : kindOf(race)
    const dist = DISTANCE_KM[kind] ?? race
    return {
      id: `plan-${s.date}`, kind, priority: 'B', name: s.title, date: s.date, confirmed: true,
      distanceKm: kind === 'other' ? race : null, goalS: s.pace ? Math.round(dist * paceToS(s.pace)) : null, loops: null, fromPlan: true,
    }
  })
}

// Read-only goal ids: the plan files' races and their events.
export const isPlanGoalId = (id: string) => id.startsWith('plan-') || handWritten().some((b) => b.goalId === id)

// A fresh install starts without goals.
export const DEFAULT_GOALS: SeasonGoal[] = []

// What is stored: the full list of own goals. Older rows (a plain array of edited defaults) are
// merged with the defaults so nothing disappears.
export interface StoredSeason { v: 2; goals: SeasonGoal[] }

export function storedGoals(raw: unknown): SeasonGoal[] {
  if (raw && typeof raw === 'object' && (raw as StoredSeason).v === 2) return (raw as StoredSeason).goals.map(normalize)
  const legacy = Array.isArray(raw) ? (raw as SeasonGoal[]).map(normalize) : []
  return DEFAULT_GOALS.map((d) => legacy.find((g) => g.id === d.id) ?? d)
}

function normalize(g: Partial<SeasonGoal> & Pick<SeasonGoal, 'id' | 'kind' | 'name' | 'date'>): SeasonGoal {
  return {
    id: g.id, kind: g.kind, priority: g.priority ?? DEFAULT_PRIORITY[g.kind], name: g.name, date: g.date,
    confirmed: g.confirmed ?? false, distanceKm: g.distanceKm ?? null, goalS: g.goalS ?? null, loops: g.loops ?? null,
    ...(g.role ? { role: g.role } : {}), ...(g.paceS != null ? { paceS: g.paceS } : {}),
  }
}

// Plan-file races, plan events and own goals in date order (A before B on the same day).
export function allGoals(own: SeasonGoal[]): SeasonGoal[] {
  return [...planRaceGoals(), ...planEvents(), ...own.filter((g) => !isPlanGoalId(g.id))]
    .sort((a, b) => a.date.localeCompare(b.date) || a.priority.localeCompare(b.priority))
}

export const distanceOf = (g: SeasonGoal) => DISTANCE_KM[g.kind] ?? g.distanceKm

// Time goal → seconds: 'h:mm:ss' always; two parts are 'mm:ss' for 5/10 km ('42:30') and 'h:mm' otherwise ('1:25').
export function parseClock(text: string, short = false): number | null {
  const t = text.trim()
  const three = t.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/)
  if (three) return Number(three[1]) * 3600 + Number(three[2]) * 60 + Number(three[3])
  const two = t.match(/^(\d{1,2}):([0-5]\d)$/)
  if (two) return short ? Number(two[1]) * 60 + Number(two[2]) : Number(two[1]) * 3600 + Number(two[2]) * 60
  return null
}

export const isShort = (k: GoalKind) => k === '5k' || k === '10k'

// German error, or null when the goal may be saved.
export function validateGoal(goal: SeasonGoal, others: SeasonGoal[], today: string): string | null {
  if (isPlanGoalId(goal.id)) return 'Das steht im Trainingsplan und lässt sich hier nicht ändern.'
  if (!goal.name.trim()) return 'Bitte einen Namen eingeben.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(goal.date) || Number.isNaN(parseISO(goal.date).getTime())) return 'Das Datum ist ungültig.'
  if (goal.date <= today) return 'Das Datum muss in der Zukunft liegen.'
  const fixed = planRaceGoals().filter((g) => g.date >= goal.date).pop()
  if (goal.priority === 'A' && fixed) return `Ein Hauptrennen muss nach ${fixed.name} (${format(parseISO(fixed.date), 'd.M.yyyy')}) liegen.`
  const clash = others.find((o) => o.id !== goal.id && o.date === goal.date)
  if (clash) return `Am selben Tag steht schon ${clash.name}.`
  if (goal.kind === 'other' && (goal.distanceKm == null || goal.distanceKm < DIST[0] || goal.distanceKm > DIST[1])) return 'Bitte die Strecke in km angeben (1 bis 250).'
  if (goal.goalS != null && (goal.goalS < GOAL_S[0] || goal.goalS > GOAL_S[1])) return 'Die Zielzeit muss zwischen 0:10:00 und 6:00:00 liegen.'
  if (goal.goalS != null && goal.kind === 'backyard') return 'Beim Backyard ist das Ziel eine Rundenzahl.'
  if (goal.role != null && (goal.priority !== 'B' || !['test', 'build', 'fun'].includes(goal.role))) return 'Die Rolle gibt es nur für Nebenrennen.'
  if (goal.paceS != null && (!Number.isInteger(goal.paceS) || goal.paceS < 150 || goal.paceS > 480)) return 'Das Testtempo muss zwischen 2:30 und 8:00 /km liegen.'
  if (goal.loops != null && (goal.kind !== 'backyard' || !Number.isInteger(goal.loops) || goal.loops < LOOPS[0] || goal.loops > LOOPS[1])) return 'Runden: eine ganze Zahl von 1 bis 100.'
  return null
}

export type GoalItem = { type: 'goal'; goal: SeasonGoal; daysLeft: number; done: boolean; current: boolean }
export type BlockItem = {
  type: 'block'; from: SeasonGoal; to: SeasonGoal; recoveryEnd: string; buildWeeks: number; short: boolean; current: boolean
  events: GoalItem[]   // minor races and runs inside the block
}
export type TimelineItem = GoalItem | BlockItem

// Main races with the block between each pair: recovery after the earlier race, then full build
// weeks until the next one. Minor races go into their block (or stand on their own before the first
// or after the last main race). 'current' marks where today is.
export function seasonTimeline(goals: SeasonGoal[], today: string): TimelineItem[] {
  const goalItem = (g: SeasonGoal): GoalItem => {
    const daysLeft = differenceInCalendarDays(parseISO(g.date), parseISO(today))
    return { type: 'goal', goal: g, daysLeft, done: daysLeft < 0, current: false }
  }
  const mains = goals.filter((g) => g.priority === 'A')
  const minors = goals.filter((g) => g.priority === 'B')
  const items: TimelineItem[] = []
  const loose = (from: string | null, to: string | null) => minors
    .filter((m) => (from == null || m.date > from) && (to == null || m.date < to)).map(goalItem)

  items.push(...loose(null, mains[0]?.date ?? null))
  mains.forEach((g, i) => {
    items.push(goalItem(g))
    const next = mains[i + 1]
    if (!next) return
    const file = handWritten().find((b) => b.goalId === g.id)
    const recoveryEnd = file ? file.end : format(addDays(parseISO(g.date), RECOVERY_WEEKS[g.kind] * 7), 'yyyy-MM-dd')
    const buildWeeks = Math.max(0, Math.floor(differenceInCalendarDays(parseISO(next.date), parseISO(recoveryEnd)) / 7))
    items.push({
      type: 'block', from: g, to: next, recoveryEnd, buildWeeks, short: buildWeeks < MIN_BUILD_WEEKS[next.kind],
      current: today > g.date && today < next.date, events: loose(g.date, next.date),
    })
  })
  if (mains.length) items.push(...loose(mains[mains.length - 1].date, null))

  // Not inside a block (before the first main race or on race day): the next main race is "now".
  if (!items.some((x) => x.current)) {
    const next = items.find((x): x is GoalItem => x.type === 'goal' && x.goal.priority === 'A' && x.daysLeft >= 0)
    if (next) next.current = true
  }
  return items
}

const clock = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export const clockText = (s: number | null) => (s == null ? '' : clock(s))

// Goal in words: '1:25:00 · 4:02/km', '24 Runden · 161 km', '26,1 km' or 'Ziel offen'.
export function goalText(g: SeasonGoal): string {
  const dist = distanceOf(g)
  if (g.goalS != null && dist) {
    const pace = Math.round(g.goalS / dist)
    return `${clock(g.goalS)} · ${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')}/km`
  }
  if (g.loops != null) return `${g.loops} ${g.loops === 1 ? 'Runde' : 'Runden'} · ${Math.round(g.loops * BACKYARD_LOOP_KM)} km`
  return 'Ziel offen'
}
