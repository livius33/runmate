// Methodology templates (methodologies/*.md): the YAML frontmatter holds every parameter the generator and the
// adaptation engine read; the body explains the approach in German. This file is the schema. Pure.
import { z } from 'zod'

export const DISTANCES = ['10k', 'half', 'marathon'] as const
export const PHASES = ['base', 'build', 'peak', 'taper'] as const

// Workout kinds a template may use; the generator knows how to build each one (07-03).
export const WORKOUT_KINDS = [
  'easy', 'recovery', 'strides', 'hills', 'tempo', 'threshold', 'intervals_vo2', 'marathon_pace', 'half_marathon_pace',
  'medium_long', 'long_easy', 'long_with_pace', 'progression', 'test',
] as const

// Pace names a template sets as offsets from race pace (s/km, + = slower).
export const PACE_NAMES = ['easy', 'recovery', 'long', 'marathon_pace', 'half_marathon_pace', 'threshold', 'intervals_vo2', 'strides'] as const

// Adaptation strategies (runmate-app replanningStrategies) and the triggers that pick one.
export const STRATEGIES = [
  'volume_adjustment', 'recovery_week_insertion', 'intensity_reduction', 'workout_reordering',
  'goal_adjustment', 'phase_restructuring', 'workout_swapping', 'complete_replan',
] as const
export const TRIGGERS = ['missed_km', 'missed_key', 'fatigue_tsb', 'acwr_high', 'volume_below', 'volume_above'] as const

const share = z.number().min(0).max(1)
const SUM_TOLERANCE = 0.011
const sumsToOne = (o: Record<string, number>) => Math.abs(Object.values(o).reduce((a, b) => a + b, 0) - 1) <= SUM_TOLERANCE
const sumMsg = (o: Record<string, number>) => `Summe ${fmt(Object.values(o).reduce((a, b) => a + b, 0))} – muss 1 sein`
const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',')

const range = z.tuple([share, share]).refine(([a, b]) => a <= b, { message: 'Startwert größer als Endwert' })
const minWeeks = z.object({ base: z.number().int().min(0).max(12), build: z.number().int().min(0).max(12), peak: z.number().int().min(0).max(12) }).strict()
const intensity = z.object({ easy: share, moderate: share, hard: share }).strict()
  .superRefine((o, ctx) => { if (!sumsToOne(o)) ctx.addIssue({ code: 'custom', message: sumMsg(o) }) })

const workout = z.object({
  kind: z.enum(WORKOUT_KINDS),
  unit: z.enum(['km', 'reps', 'minutes']),
  from: z.number().positive(),
  to: z.number().positive(),
  note: z.string().optional(),
}).strict().refine((w) => w.from <= w.to, { message: 'from größer als to' })

export const MethodologySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'nur Kleinbuchstaben, Ziffern und -'),
  name: z.string().min(1),
  version: z.number().int().positive(),
  distances: z.array(z.enum(DISTANCES)).min(1),
  summary: z.string().min(1),
  sources: z.array(z.object({ author: z.string(), title: z.string(), year: z.number().int(), note: z.string().optional() }).strict()).min(1),

  phases: z.object({
    split: z.object({ base: share, build: share, peak: share }).strict()
      .superRefine((o, ctx) => { if (!sumsToOne(o)) ctx.addIssue({ code: 'custom', message: sumMsg(o) }) }),
    taper: z.object({
      weeks: z.object({ '10k': z.number().int().min(1).max(3).optional(), half: z.number().int().min(1).max(3).optional(), marathon: z.number().int().min(1).max(4).optional() }).strict(),
      volume: z.array(share).min(1).max(4),            // share of peak per taper week; the last one is race week
    }).strict(),
    // Shortest base/build/peak per distance and which phase gives up weeks first (research phases-and-taper.md 1.3).
    min_weeks: z.object({ '10k': minWeeks, half: minWeeks, marathon: minWeeks }).strict()
      .default({ '10k': { base: 1, build: 2, peak: 2 }, half: { base: 2, build: 2, peak: 2 }, marathon: { base: 2, build: 3, peak: 3 } }),
    shorten_order: z.array(z.enum(['base', 'build', 'peak'])).length(3)
      .refine((a) => new Set(a).size === 3, { message: 'jede Phase genau einmal' }).default(['build', 'base', 'peak']),
  }).strict(),

  volume: z.object({
    start: share,                                      // first week, share of peak
    phases: z.object({ base: range, build: range, peak: range }).strict(),
    ramp_max: z.number().min(0).max(1),
    recovery_week: z.object({ every: z.number().int().min(2).max(8), volume: share }).strict(),
    // Peak from current and proven volume (research peak-and-recovery.md 1.3–1.4).
    peak: z.object({
      over_base: z.number().min(1.1).max(1.6).default(1.35),       // new ground: peak ≤ current × this
      over_proven: z.number().min(0.8).max(1.1).default(1),        // known ground: peak ≤ proven × this
      max_km: z.number().positive().optional(),
      floor: z.object({ '10k': z.number().positive(), half: z.number().positive(), marathon: z.number().positive() }).strict()
        .default({ '10k': 30, half: 35, marathon: 50 }),            // below this only a warning
    }).strict().default({}),
    growth: z.number().min(0.02).max(0.08).default(0.05),          // net weekly growth above proven volume
    growth_return: z.number().min(0.04).max(0.1).default(0.08),    // … while still below it
  }).strict(),

  intensity: z.object({ base: intensity, build: intensity, peak: intensity, taper: intensity }).strict(),

  week: z.object({
    runs: z.number().int().min(2).max(14),
    key_sessions: z.object({ base: z.number().int().min(0).max(4), build: z.number().int().min(0).max(4), peak: z.number().int().min(0).max(4), taper: z.number().int().min(0).max(4) }).strict(),
    key_gap_days: z.number().int().min(1).max(4),
    long_run: z.object({
      share: share, max_km: z.number().positive(), max_minutes: z.number().int().positive(),
      race_pace: z.boolean().default(true),             // race-pace blocks in long runs (research long-run.md, G-17 part)
    }).strict(),
  }).strict(),

  workouts: z.object({
    base: z.array(workout), build: z.array(workout), peak: z.array(workout), taper: z.array(workout),
  }).strict(),

  paces: z.object({
    source: z.enum(['goal_time', 'vdot', 'threshold']),
    offsets: z.record(z.enum(PACE_NAMES), z.number().int().min(-60).max(150)),
  }).strict(),

  adaptation: z.object({
    thresholds: z.object({ tsb_fatigue: z.number(), acwr_caution: z.number().positive() }).strict(),
    fatigue: z.object({ share: share, days: z.number().int().min(1).max(7) }).strict(),
    missed_km: z.object({ strategy: z.enum(['redistribute', 'drop']), cap_pct: share, cap_km: z.number().min(0) }).strict(),
    missed_key: z.object({ strategy: z.enum(['move', 'drop']), max_shift_days: z.number().int().min(1).max(14) }).strict(),
    volume_review: z.object({ weeks: z.number().int().min(1).max(8), below: share, above: z.number().min(1).max(2) }).strict(),
    triggers: z.record(z.enum(TRIGGERS), z.enum(STRATEGIES)),
    // 07-18 (research modifiers.md 5.3, adaptation.md 4.3): optional; missing = the 07-16 / 07-08 values
    events: z.object({
      pre_easy_days: z.object({ short: z.number().int().min(1).max(5), half: z.number().int().min(1).max(6), long: z.number().int().min(1).max(7) }).strict().optional(),
      post_easy: z.object({ per_km: z.number().min(2).max(6), min: z.number().int().min(2).max(7) }).strict().optional(),
      test_post_days: z.number().int().min(1).max(5).optional(),
      light_from_km: z.number().min(5).max(42.2).optional(),
      light_share: z.number().min(0.25).max(1).optional(),
      test_window_days: z.number().int().min(0).max(56).optional(),
      build_from_km: z.number().min(3).max(42.2).optional(),
    }).strict().optional(),
    return: z.object({
      week1_share: z.number().min(0.3).max(1).optional(),
      week2_share: z.number().min(0.5).max(1.2).optional(),
      week2_quality: z.enum(['threshold', 'easy']).optional(),
      long_share: z.number().min(0.5).max(1).optional(),
    }).strict().optional(),
  }).strict(),
}).strict()

export type Methodology = z.infer<typeof MethodologySchema>
export type WorkoutKind = (typeof WORKOUT_KINDS)[number]
export type Distance = (typeof DISTANCES)[number]
