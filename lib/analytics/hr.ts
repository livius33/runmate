// One heart-rate model for the whole app, derived from the runner's profile (lib/profile.ts, read through lib/scope.ts).
// Never hard-code HR values: call hrZones(), hrMax(), raceHr() — they follow the user whose request this is.
import { currentScope } from '@/lib/scope'
import type { ResolvedProfile } from '@/lib/profile'

export interface HrZone { zone: number; name: string; label: string; min: number; max: number }
type HrModel = Pick<ResolvedProfile, 'hrMax' | 'hrRest' | 'lthr' | 'zoneModelUsed'>

const profile = (): HrModel => currentScope().profile
export const hrMax = (p: HrModel = profile()) => p.hrMax
export const hrRest = (p: HrModel = profile()) => p.hrRest

const NAMES = [['Z1', 'Regeneration'], ['Z2', 'Grundlage'], ['Z3', 'Aerob'], ['Z4', 'Schwelle'], ['Z5', 'VO2max']] as const
// Zone limits as shares of the anchor. 'hrmax': the shares Runmate always used (research paces.md §2.1).
// 'lthr': Friel's running zones as shares of lactate-threshold HR (Friel 2009, The Triathlete's Training Bible).
const SHARES = { hrmax: [0.65, 0.71, 0.775, 0.85], lthr: [0.85, 0.90, 0.95, 1.0] } as const

export function zonesFor(p: HrModel): readonly HrZone[] {
  const model = p.zoneModelUsed
  const anchor = model === 'lthr' ? p.lthr! : p.hrMax
  const limits = [0, ...SHARES[model].map((s) => Math.round(anchor * s)), 999]
  return NAMES.map(([name, label], i) => ({ zone: i + 1, name, label, min: limits[i], max: limits[i + 1] }))
}

const memo = new WeakMap<object, readonly HrZone[]>()
// The zones of this request's user.
export function hrZones(p: HrModel = profile()): readonly HrZone[] {
  let z = memo.get(p)
  if (!z) { z = zonesFor(p); memo.set(p, z) }
  return z
}

// Race-pace block HR per race distance (research paces.md §2.1): below `cap` = on course, from `hard` = too hard.
// Shares of HFmax in both zone models; marathon: the cap is the HFmax model's Z4 top (athlete().raceHrCap).
// `hard` is always 5 beats above `cap`.
export function raceHr(distanceKm: number, p: HrModel = profile()): { cap: number; hard: number } {
  const share = distanceKm > 30 ? 0.85 : distanceKm > 15 ? 0.89 : 0.925
  const cap = Math.round(p.hrMax * share)
  return { cap, hard: cap + 5 }
}

// The HR cap of a paced block in a block preparing `race`: race-pace work (marathon: also anything slower than race
// pace; shorter races: up to 5 s/km slower) → the race cap; faster or threshold work → Z4 max.
export const isRacePaceWork = (paceS: number, race: { distanceKm: number; goalPaceS: number }) =>
  race.distanceKm > 30 ? paceS >= race.goalPaceS : paceS >= race.goalPaceS && paceS <= race.goalPaceS + 5
export function blockHrCap(paceS: number, race: { distanceKm: number; goalPaceS: number }) {
  return isRacePaceWork(paceS, race) ? raceHr(race.distanceKm).cap : hrZones()[3].max
}

export function zoneIndex(bpm: number) {
  return hrZones().findIndex((z) => bpm >= z.min && bpm < z.max)
}
