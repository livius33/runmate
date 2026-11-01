// Example season after the Porto block: a half marathon in February and a backyard ultra in August (placeholder
// dates). The tests plan generated blocks for these goals; a fresh install starts without goals.
import type { SeasonGoal } from '@/lib/season/goals'

export const EXAMPLE_GOALS: SeasonGoal[] = [
  { id: 'hm-2027', kind: 'half', priority: 'A', name: 'Halbmarathon', date: '2027-02-28', confirmed: false, distanceKm: null, goalS: 85 * 60, loops: null },
  { id: 'backyard-2027', kind: 'backyard', priority: 'A', name: 'Backyard Ultra', date: '2027-08-14', confirmed: false, distanceKm: null, goalS: null, loops: null },
]
