// One call for a whole draft (07-06): paces → week skeleton → days → workouts, from a season goal, a template, the
// plan start, the athlete profile and the measured inputs (with the runner's overrides). Every step's warnings are kept in
// order; any step's German error stops the draft. Pure.
import type { Distance, Methodology } from '../methodology/schema'
import type { AthleteProfile } from '../athlete-profile'
import { KIND_LABEL, type GoalKind, type SeasonGoal } from '@/lib/season/goals'
import { buildSkeleton, type Skeleton } from './skeleton'
import { buildDays, type DaysPlan } from './days'
import { trainingPaces, type Paces } from './paces'
import { buildWorkouts, type WorkoutPlan } from './workouts'
import type { MeasuredInputs } from './inputs'
import { recoveryAfterRace } from './recovery'
import type { PlanSession, PlanWeek, RaceInfo } from '../types'
import type { Weekday } from '../athlete-profile'
import { kbDaysOf, placeStrength } from '../strength'

export interface DraftOverrides { currentKm?: number | null; provenKm?: number | null; peakKm?: number | null; longest30Km?: number | null; goalS?: number | null }
export interface DraftChoice {
  goal: SeasonGoal
  template: Methodology
  start: string
  profile: AthleteProfile | null
  measured: MeasuredInputs
  overrides?: DraftOverrides
}
export type InputField = { value: number | null; measured: number | null; override: boolean }
export interface Draft {
  ok: true
  distance: Distance
  inputs: { currentKm: InputField; provenKm: InputField; longest30Km: InputField; peakKm: InputField; goalS: InputField; currentKmSource: MeasuredInputs['currentKmSource']; recentRace: MeasuredInputs['recentRace'] }
  paces: Paces
  skeleton: Skeleton
  days: DaysPlan
  workouts: WorkoutPlan
  recovery?: { weeks: PlanWeek[]; sessions: PlanSession[] }   // after the race (07-22); missing in drafts saved before
  warnings: { step: 'Wochen' | 'Tage' | 'Einheiten'; text: string }[]
}
export type DraftResult = Draft | { ok: false; error: string }

export const GOAL_DISTANCE: Partial<Record<GoalKind, Distance>> = { marathon: 'marathon', half: 'half', '10k': '10k' }

export function generateDraft(c: DraftChoice): DraftResult {
  const distance = GOAL_DISTANCE[c.goal.kind]
  if (!distance) return { ok: false, error: `Für ${KIND_LABEL[c.goal.kind]} gibt es noch keine Vorlage.` }
  const o = c.overrides ?? {}
  const field = (measured: number | null, override?: number | null): InputField =>
    override != null ? { value: override, measured, override: true } : { value: measured, measured, override: false }
  const inputs = {
    currentKm: field(c.measured.currentKm, o.currentKm), provenKm: field(c.measured.provenKm, o.provenKm),
    longest30Km: field(c.measured.longest30Km, o.longest30Km), peakKm: field(null, o.peakKm), goalS: field(c.goal.goalS, o.goalS),
    currentKmSource: c.measured.currentKmSource, recentRace: c.measured.recentRace,
  }
  const goalS = inputs.goalS.value
  if (!goalS) return { ok: false, error: 'Zielzeit fehlt: auf der Saison-Seite eintragen oder hier setzen.' }
  if (!inputs.currentKm.value) return { ok: false, error: 'Kein aktueller Wochenumfang: Läufe synchronisieren oder hier setzen.' }

  const base = { template: c.template, distance, raceDate: c.goal.date, raceName: c.goal.name, profile: c.profile, goalS, recentRace: c.measured.recentRace }
  const paces = trainingPaces(base)
  const skeleton = buildSkeleton({
    ...base, start: c.start, currentKm: inputs.currentKm.value, currentKmSource: o.currentKm != null ? 'manual' : c.measured.currentKmSource,
    provenKm: inputs.provenKm.value, peakKm: inputs.peakKm.value, experience: c.profile?.experience, age: c.profile?.age,
  })
  if (!skeleton.ok) return skeleton
  const days = buildDays(skeleton, { ...base, racePaceS: paces.racePaceS, longest30Km: inputs.longest30Km.value ?? 0, longest12mKm: c.measured.longest12mKm })
  if (!days.ok) return days
  const workouts = buildWorkouts(days, skeleton, base)
  if (!workouts.ok) return workouts
  const warnings = [
    ...skeleton.warnings.map((text) => ({ step: 'Wochen' as const, text })),
    ...days.warnings.map((text) => ({ step: 'Tage' as const, text })),
    ...workouts.warnings.map((text) => ({ step: 'Einheiten' as const, text })),
  ]
  const recovery = recoveryOf({ distance, days, workouts, paces, raceDate: c.goal.date })
  // Kettlebell markers after the workouts: the tests (Generalprobe) are placed there and keep 2 days free.
  const kb = markDraft({ weeks: days.weeks, sessions: workouts.sessions, recovery, raceDate: c.goal.date }, kbDaysOf(c.profile))
  return { ok: true, distance, inputs, paces, skeleton, days, workouts: { ...workouts, sessions: kb.sessions }, recovery: kb.recovery, warnings }
}

// Markers on the draft's days and recovery weeks, by the same rules as every block (lib/plan/strength.ts).
function markDraft(d: { weeks: PlanWeek[]; sessions: PlanSession[]; recovery: { weeks: PlanWeek[]; sessions: PlanSession[] }; raceDate: string }, kbDays: Weekday[]) {
  const block = { id: 'draft', goalId: 'draft', race: { date: d.raceDate } as RaceInfo, planStart: d.weeks[0]?.start ?? d.raceDate, end: d.raceDate,
    weeks: [...d.weeks, ...d.recovery.weeks], sessions: [...d.sessions, ...d.recovery.sessions], rules: [], stopRules: [], levers: [] }
  const marked = new Map(placeStrength(block, kbDays).sessions.map((s) => [s.date, s]))
  return {
    sessions: d.sessions.map((s) => marked.get(s.date) ?? s),
    recovery: { ...d.recovery, sessions: d.recovery.sessions.map((s) => marked.get(s.date) ?? s) },
  }
}

// Recovery weeks after the race from the generated plan (07-22).
export function recoveryOf(d: Pick<Draft, 'distance' | 'days' | 'workouts' | 'paces'> & { raceDate: string }) {
  return recoveryAfterRace({ raceDate: d.raceDate, distance: d.distance, weeks: d.days.weeks, sessions: d.workouts.sessions,
    easyPaceS: d.paces.paces.easy, thresholdPaceS: d.paces.paces.threshold })
}
