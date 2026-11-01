// Adaptation rules per training block (07-07). The engine, Plan anpassen and the cards that show the red zone read the
// rules of the block a date belongs to: a hand-written block without its own rules uses DEFAULT_RULES, a generated
// block carries the rules frozen from its (tuned) template. Pure.
import type { Distance, Methodology, STRATEGIES } from './methodology/schema'
import { blockFor } from './blocks'

export type Strategy = (typeof STRATEGIES)[number]

export interface EngineRules {
  tsbRed: number                 // red zone: TSB below …
  acwrRed: number                // … or ACWR above
  fatigueShare: number           // a softened session keeps this share of its km
  fatigueDays: number            // the guard looks at today and the next n − 1 days
  fatigueStrategy: Strategy      // what the template asks for in the red zone (the engine softens; others noted)
  moveMissedKey: boolean         // missed key session: move (true) or let it go (false)
  maxShiftDays: number
  keyGapDays: number             // no other key session within ± n days
  rebalance: boolean             // missed km of the week: redistribute (true) or drop (false)
  capPct: number                 // a day may grow at most +capPct …
  capKm: number                  // … and at most +capKm over its planned km
  recentLow: number              // Plan anpassen: run ≤ this share of the plan → scale down
  recentHigh: number             // … ≥ this share and fresh → offer more
  // 07-18: what the block's method does differently. Missing = the defaults (hand-written blocks and blocks frozen before 07-18).
  taperDays?: number             // engine: nothing moves into the last n days before the race (default 9)
  events?: EventOverrides        // minor races (lib/plan/events.ts EVENT_RULES)
  return?: ReturnOverrides       // graded return after Krank/Pause (lib/plan/pause.ts RETURN_RULES)
  recoveryVolume?: number        // red zone → recovery week: the template's recovery volume (only with that strategy)
  // 07-23 (G-24, research adaptation.md §2.3, Toresdahl 2023): ACWR alone counts after n days above acwrRed in a row.
  // Missing = ACWR_PERSIST_DAYS; DEFAULT_RULES keep the original one-day rule.
  acwrPersistDays?: number
}

export interface EventOverrides {
  preEasy?: { short: number; half: number; long: number }   // easy days before a race ≤ 10 km / ≤ 21,1 km / longer
  postPerKm?: number             // build race: one easy day per n km …
  postMin?: number               // … at least this many
  testPostDays?: number
  lightMinKm?: number            // the race week is light from this distance …
  lightShare?: number            // … or from this share of the goal distance
  testDaysBefore?: number        // default role 'test' this close to the goal race
  buildMinKm?: number            // default role 'build' from this distance
}
export interface ReturnOverrides {
  week1Share?: number
  week2Share?: number
  week2Quality?: 'threshold' | 'easy'   // what race-pace sessions become in return week 2
  longShare?: number
}

export const DEFAULT_TAPER_DAYS = 9

export { DEFAULT_PACES, DEFAULT_STOP_RULES } from './defaults'
export const ACWR_PERSIST_DAYS = 3
export const acwrPersistOf = (r: EngineRules) => r.acwrPersistDays ?? ACWR_PERSIST_DAYS
export const taperDaysOf = (r: EngineRules) => r.taperDays ?? DEFAULT_TAPER_DAYS

// Rules for a block without its own (hand-written blocks such as examples/porto-2026, dates outside every block).
export const DEFAULT_RULES: EngineRules = {
  tsbRed: -25, acwrRed: 1.5, fatigueShare: 0.7, fatigueDays: 3, fatigueStrategy: 'intensity_reduction',
  moveMissedKey: true, maxShiftDays: 7, keyGapDays: 2, rebalance: true, capPct: 0.3, capKm: 5, recentLow: 0.85, recentHigh: 1.15,
  acwrPersistDays: 1,            // one day above 1.5 is enough
}

// A template's adaptation section as engine rules (frozen into the block when it goes live).
export function rulesFromTemplate(t: Methodology, distance?: Distance): EngineRules {
  const a = t.adaptation
  const taperWeeks = distance ? t.phases.taper.weeks[distance] : undefined
  const e = a.events, ret = a.return
  const events: EventOverrides = clean({
    preEasy: e?.pre_easy_days, postPerKm: e?.post_easy?.per_km, postMin: e?.post_easy?.min, testPostDays: e?.test_post_days,
    lightMinKm: e?.light_from_km, lightShare: e?.light_share, testDaysBefore: e?.test_window_days, buildMinKm: e?.build_from_km,
  })
  const back: ReturnOverrides = clean({ week1Share: ret?.week1_share, week2Share: ret?.week2_share, week2Quality: ret?.week2_quality, longShare: ret?.long_share })
  return {
    tsbRed: a.thresholds.tsb_fatigue, acwrRed: a.thresholds.acwr_caution,
    fatigueShare: a.fatigue.share, fatigueDays: a.fatigue.days,
    fatigueStrategy: a.triggers.fatigue_tsb ?? 'intensity_reduction',
    moveMissedKey: a.missed_key.strategy === 'move', maxShiftDays: a.missed_key.max_shift_days, keyGapDays: t.week.key_gap_days,
    rebalance: a.missed_km.strategy === 'redistribute', capPct: a.missed_km.cap_pct, capKm: a.missed_km.cap_km,
    recentLow: a.volume_review.below, recentHigh: a.volume_review.above,
    ...(a.triggers.fatigue_tsb === 'recovery_week_insertion' ? { recoveryVolume: t.volume.recovery_week.volume } : {}),
    ...(taperWeeks ? { taperDays: Math.max(SAFETY_TAPER_DAYS_MIN, 7 * taperWeeks) } : {}),
    ...(Object.keys(events).length ? { events } : {}),
    ...(Object.keys(back).length ? { return: back } : {}),
  }
}

const SAFETY_TAPER_DAYS_MIN = 7
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export function rulesFor(date: string): EngineRules {
  return blockFor(date)?.engine ?? DEFAULT_RULES
}

// Red zone by the rules of that date.
// acwrRecent: ACWR of today and the days before it (today first); without it only today is known.
export interface RedZoneFitness { tsb: number | null; acwr: number | null; acwrRecent?: (number | null)[] }

// Days in a row, today first, with ACWR above the block's threshold (0 when today is not above).
export function acwrStreak(f: RedZoneFitness | undefined, r: EngineRules): number {
  const days = f?.acwrRecent ?? [f?.acwr ?? null]
  let n = 0
  while (n < days.length && days[n] != null && days[n]! > r.acwrRed) n++
  return n
}

export function inRedZone(f: RedZoneFitness | undefined, r: EngineRules) {
  return !!f && ((f.tsb != null && f.tsb < r.tsbRed) || acwrStreak(f, r) >= acwrPersistOf(r))
}

// ACWR above the threshold, but not yet on enough days to count: a note only, no plan change.
export function acwrCaution(f: RedZoneFitness | undefined, r: EngineRules) {
  const n = acwrStreak(f, r)
  return n >= 1 && n < acwrPersistOf(r)
}

// "ACWR 1.62" as the cards have always written it; where the rule needs several days: "ACWR 1.62 seit 3 Tagen"
// (the one-day rule keeps the short text).
export function acwrWhy(f: RedZoneFitness, r: EngineRules) {
  const n = acwrStreak(f, r)
  return `ACWR ${f.acwr!.toFixed(2)}${acwrPersistOf(r) > 1 && n >= 2 ? ` seit ${n} Tagen` : ''}`
}

export const STRATEGY_LABEL: Record<Strategy, string> = {
  volume_adjustment: 'Umfang anpassen', recovery_week_insertion: 'Erholungswoche einschieben', intensity_reduction: 'Intensität senken',
  workout_reordering: 'Einheiten verschieben', goal_adjustment: 'Ziel anpassen', phase_restructuring: 'Phasen umbauen',
  workout_swapping: 'Einheiten tauschen', complete_replan: 'neu planen',
}
