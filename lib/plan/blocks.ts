// The training blocks Runmate knows, in date order. Plan, engine and cards look up weeks, sessions and "the race" here
// instead of assuming one plan. The registry starts empty: generated blocks go live from the app (07-14): the server
// registers them from settings 'plan_blocks' (lib/plan/live-blocks.ts), the browser from the dashboard layout
// (components/UserScope.tsx). Hand-written plan files (e.g. examples/porto-2026) come from lib/plan/plan-files.ts
// or registerBuiltInBlocks(). Every lookup stays synchronous.
// Live blocks belong to a user: they live in the request's scope (lib/scope.ts), never in module state; plan files are
// code and shared by everyone.
import type { PlanSession, PlanWeek, RaceInfo, TrainingBlock } from './types'
import { DEFAULT_PACES, DEFAULT_STOP_RULES } from './defaults'
import { PLAN_FILES } from './plan-files'
import { currentScope, writableScope } from '@/lib/scope'

const byStart = (list: TrainingBlock[]) => [...list].sort((a, c) => a.planStart.localeCompare(c.planStart))
let builtIn: TrainingBlock[] = byStart(PLAN_FILES)
let builtInVersion = 0

// This user's registry: plan files plus their accepted live blocks (computed once per registration).
function registry(): TrainingBlock[] {
  const s = currentScope()
  if (!s.registry || s.registryVersion !== builtInVersion) {
    s.registry = accept(s.live)
    s.registryVersion = builtInVersion
  }
  return s.registry
}

// Stand-in when no block exists at all (fresh install): no weeks, no sessions, a race far in the future so nothing
// counts as "after the race". Pages check hasBlocks() and show an empty state instead of race cards.
export const NO_BLOCK: TrainingBlock = {
  id: 'none', goalId: 'none',
  race: { name: 'Kein Ziel', shortName: 'Kein Ziel', code: '–', date: '2999-12-31', distanceKm: 42.195,
    goalS: 42.195 * 300, goalPaceS: 300, fallbackS: 42.195 * 309, fallbackPaceS: 309 },
  planStart: '2999-12-31', end: '2999-12-31', weeks: [], sessions: [], rules: [], stopRules: DEFAULT_STOP_RULES, levers: [],
  paces: DEFAULT_PACES,
}
export const hasBlocks = () => registry().length > 0

// Built-in blocks first; a live block that overlaps one already accepted (or is malformed) is dropped, never thrown.
function accept(live: TrainingBlock[]): TrainingBlock[] {
  const out: TrainingBlock[] = [...builtIn]
  for (const b of [...live].sort((a, c) => a.planStart.localeCompare(c.planStart))) {
    const ok = b && typeof b.id === 'string' && b.planStart <= b.end && Array.isArray(b.weeks) && Array.isArray(b.sessions) && b.race?.date
    if (!ok || out.some((x) => x.id === b.id || (b.planStart <= x.end && x.planStart <= b.end))) {
      console.warn(`Trainingsblock ${b?.id ?? '?'} übersprungen (ungültig oder überlappend)`)
      continue
    }
    out.push(b)
  }
  return out.sort((a, c) => a.planStart.localeCompare(c.planStart))
}

// The live blocks of the user whose scope this is.
export function registerLiveBlocks(live: TrainingBlock[]) {
  const s = writableScope()
  s.live = live
  s.registry = null
}

// Hand-written blocks (plan files) that are always present, e.g. examples/porto-2026 in the tests. Shared by all users.
export function registerBuiltInBlocks(list: TrainingBlock[]) {
  builtIn = byStart(list)
  builtInVersion++
}
export const builtInBlocks = () => builtIn

export function blocks(): TrainingBlock[] {
  return registry()
}

// The block a race belongs to and whether a date is part of its preparation (07-20): tests, engine log entries and runs
// about this race come only from planStart … race day of that block.
export const raceBlock = (race: RaceInfo) => registry().find((b) => b.race.date === race.date) ?? null
export function inRaceWindow(date: string, race: RaceInfo) {
  const b = raceBlock(race)
  return date <= race.date && (!b || date >= b.planStart)
}

// The block whose window (planStart … end) contains the date.
export function blockFor(date: string): TrainingBlock | null {
  return registry().find((b) => b.planStart <= date && date <= b.end) ?? null
}

// The block containing today, else the next one, else the last one (NO_BLOCK when there is none).
export function activeBlock(today: string): TrainingBlock {
  return blockFor(today) ?? registry().find((b) => b.planStart > today) ?? registry()[registry().length - 1] ?? NO_BLOCK
}

// Race of the block a date belongs to (or of the active block for dates outside every block).
export function raceOf(date: string): RaceInfo {
  return (blockFor(date) ?? activeBlock(date)).race
}

export function allWeeks(): PlanWeek[] {
  return registry().flatMap((b) => b.weeks)
}

export function allSessions(): PlanSession[] {
  return registry().flatMap((b) => b.sessions)
}

// The weekday after the block's long run is its recovery day (0 = Sunday; 07-21). A hand-written block: Sunday;
// a generated block: the day after its most common long-run day.
export function recoveryWeekday(date: string): number {
  const b = blockFor(date)
  if (!b || b.handWritten) return 0
  const count = new Map<number, number>()
  for (const s of b.sessions) if (s.type === 'long') { const d = new Date(`${s.date}T12:00:00Z`).getUTCDay(); count.set(d, (count.get(d) ?? 0) + 1) }
  const long = [...count].sort((a, c) => c[1] - a[1] || a[0] - c[0])[0]?.[0]
  return long == null ? 0 : (long + 1) % 7
}
export const WEEKDAY_NAME = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

// A week the engine keeps light: the recovery block after a race, or a load-cycle recovery week (07-18).
export const isEasyWeek = (w?: PlanWeek | null) => !!w && (!!w.recovery || !!w.cutback)

export function weekOf(date: string): PlanWeek | null {
  return allWeeks().find((w) => w.start <= date && date <= w.end) ?? null
}

// Before this date the plan comes from the DB (history, optional); from here on from the blocks. No block: none of
// the plan window exists yet (NO_BLOCK.planStart, far in the future).
export function firstPlanStart(): string {
  return registry()[0]?.planStart ?? NO_BLOCK.planStart
}

export const isAfterRace = (date: string) => date > raceOf(date).date

export type PaceName = 'easy' | 'threshold' | 'intervals_vo2' | 'race'
const fmtPace = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`

// Training paces of the block a date belongs to (07-08): frozen at go-live (or written into a hand-written block). A
// generated block frozen before 07-08 has none: offsets from its race pace. Outside every block: DEFAULT_PACES.
export function blockPaces(date: string): Record<PaceName, string> {
  const b = blockFor(date)
  if (!b) return DEFAULT_PACES as Record<PaceName, string>
  const rp = b.race.goalPaceS
  const p = b.paces ?? {}
  return {
    easy: p.easy ?? fmtPace(rp + 80), threshold: p.threshold ?? fmtPace(rp - 8),
    intervals_vo2: p.intervals_vo2 ?? fmtPace(rp - 25), race: p.race ?? fmtPace(rp),
  }
}
