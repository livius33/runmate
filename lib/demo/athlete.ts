// The demo athlete (Phase 5): a fictional runner preparing for a half marathon in Hamburg. Every value here is
// invented; nothing comes from a real person. Isomorphic (no Node imports): the demo pages read the constants too.
import type { UserProfile } from '@/lib/profile'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import type { SeasonGoal } from '@/lib/season/goals'

// Not a Clerk id ("user_…"), so it can never belong to a signed-in account.
export const DEMO_USER_ID = 'demo-hamburg-hm'

export const DEMO_SEED = 20260614          // mulberry32 seed: same seed + same "today" = same data

export const DEMO_PROFILE: UserProfile = {
  hrMax: 186, hrRest: 50, lthr: null, zoneModel: 'hrmax',
  pbTime: '3:38', pbRace: 'Marathon (fiktiv)', pbHr: 158,
  vo2max: 51, weightKg: 60, easyPace: '5:45',
  timezone: 'Europe/Berlin', locale: 'de',
}

export const DEMO_ATHLETE: AthleteProfile = {
  v: 1, age: 36, weightKg: 60, heightCm: 168, experience: 'intermediate', weeklyKm: 42,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 7, qualityDays: [2, 4], kbDays: [3], restDay: 5,
  maxKmWeekday: 15, maxKmWeekend: 24, fitnessMethod: 'fiveK', thresholdPaceS: null, fiveKS: 22 * 60 + 40,
  savedAt: null,
}

export const DEMO_TEMPLATE = 'pfitzinger-half'
export const DEMO_PEAK_KM = 64              // draft override: an intermediate runner's peak week
export const DEMO_GOAL_ID = 'demo-hamburg-hm'
export const DEMO_WEEKS = 12               // block length (race on the Sunday of week 12)
export const DEMO_TODAY_WEEK = 9           // "today" lies in this block week

export const demoGoal = (date: string): SeasonGoal => ({
  id: DEMO_GOAL_ID, kind: 'half', priority: 'A', name: 'Hamburg HM', date, confirmed: true,
  distanceKm: null, goalS: 99 * 60, loops: null,
})
