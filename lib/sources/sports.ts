// Sport keys (Garmin's names; the other sources map onto them) → the activity types Runmate stores. Pure.
import { crossTypeForKey } from '@/lib/analytics/cross-training'

const RUN_KEYS = ['running', 'trail_running', 'street_running', 'track_running', 'treadmill_running', 'virtual_run', 'indoor_running']

// Imported: runs, plus cross-training (strength, swim, ride, gym — lib/analytics/cross-training.ts). Everything else
// stays out.
export const isRunSport = (sport: string) => RUN_KEYS.includes(sport)
export const isImportedSport = (sport: string) => isRunSport(sport) || crossTypeForKey(sport) != null

export function typeForDb(sport: string): { type: string; sportType: string | null } {
  if (sport.includes('trail')) return { type: 'TrailRun', sportType: sport }
  if (sport.includes('treadmill') || sport === 'indoor_running' || sport === 'virtual_run') return { type: 'VirtualRun', sportType: sport }
  if (sport.includes('running')) return { type: 'Run', sportType: sport }
  const cross = crossTypeForKey(sport)
  if (cross) return cross
  // Anything else: bucket under the raw type so we don't silently lose it.
  return { type: sport.charAt(0).toUpperCase() + sport.slice(1), sportType: sport }
}
