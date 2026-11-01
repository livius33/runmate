// Plan data types shared by every training block (hand-written ones such as examples/porto-2026, and generated ones).

export type SessionType = 'easy' | 'tempo' | 'long' | 'intervals' | 'rest' | 'race' | 'recovery'

export interface PlanSession {
  date: string            // 'YYYY-MM-DD'
  type: SessionType
  km?: number
  title: string
  notes?: string          // structure of the session
  pace?: string           // target pace for the quality part, e.g. '4:23'
  key?: boolean           // key session of the week
  test?: string           // race-pace test that decides Plan A/B ('Generalprobe', 'Finaler Test'); the latest one run counts
  anchor?: boolean        // fixed date (an event): the engine never moves or softens it, it cannot be moved by hand
  was?: PlanSession       // the pace session this day had before the runner switched it to Zone 2 (to switch back)
  paused?: 'krank' | 'pause'   // a day inside a Krank/Pause period (07-08, lib/plan/pause.ts)
}

export interface PlanWeek {
  kw: number
  start: string           // Monday
  end: string             // Sunday
  km: number
  focus: string
  key?: boolean
  holiday?: boolean       // information only (no rule reads it)
  taper?: boolean         // the engine adds no km in this week
  recovery?: boolean      // after the race: the engine adds no km and moves nothing
  light?: boolean         // a minor race makes this a light week (07-16): the engine adds no km and moves nothing in
  cutback?: boolean       // a generated block's load-cycle recovery week (07-18): treated like `recovery` by the engine and
                          // the return after a pause; `recovery` itself stays the recovery block after a race (header, cards)
}

export interface RaceInfo {
  name: string
  shortName: string       // 'Berlin' — "Erholung nach Berlin"
  code: string            // 'BER' — header pill
  date: string
  distanceKm: number
  goalS: number
  goalPaceS: number
  fallbackS: number        // Plan B
  fallbackPaceS: number
  startTime?: string
  arrival?: string
  gpxPath?: string
  courseLabel?: string
  splits?: { from: number; to: number; paceS: number; hrCap: number | null; focus: string }[]   // race-day pacing; generated races derive it (race-day.ts splitsFor)
}

// A training block: one race with its weeks and sessions, from planStart to the last recovery day (end).
import type { EngineRules } from './rules'

export interface TrainingBlock {
  id: string
  goalId: string          // season goal (lib/season/goals.ts)
  race: RaceInfo
  planStart: string
  end: string
  weeks: PlanWeek[]
  sessions: PlanSession[]
  rules: string[]
  stopRules: string[]
  levers: { title: string; text: string }[]
  engine?: EngineRules     // adaptation rules frozen from the template (07-07); none = DEFAULT_RULES
  paces?: Record<string, string>   // training paces frozen at go-live (07-08 session editor)
  base?: boolean           // a rolling base block between goal blocks (07-17): computed, never stored; race = the block before
  // A hand-written block (a plan file such as examples/porto-2026, registered with registerBuiltInBlocks): minor races are
  // never applied to it, its recovery day is Sunday, its race and anchors appear read-only on the Saison page.
  handWritten?: boolean
}
