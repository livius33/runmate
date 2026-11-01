// Shared shaping of stored cross-training sessions for the lists and the Heute-Karte (08-04).
import type { activities } from '@/lib/db/schema'
import { CROSS_SPORTS, isManualId, type CrossType } from './cross-training'
import { activityLoad } from './load'

type Row = typeof activities.$inferSelect

export function crossSummary(r: Row) {
  const type = r.type as CrossType
  return {
    id: r.id,
    date: r.date,
    startTime: r.startTime,
    type,
    sport: CROSS_SPORTS[type].sport,
    label: CROSS_SPORTS[type].label,
    name: r.name,
    minutes: Math.round(r.durationS / 60),
    km: r.distanceM > 0 ? Math.round(r.distanceM / 100) / 10 : null,
    hr: r.averageHr,
    rpe: r.perceivedExertion,
    load: Math.round(activityLoad(r)),
    manual: isManualId(r.id),
  }
}
export type CrossSummary = ReturnType<typeof crossSummary>
