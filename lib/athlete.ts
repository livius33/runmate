// Athlete facts used across the app, derived from the runner's profile (lib/profile.ts; HR model in lib/analytics/hr.ts).
// Missing profile fields are example defaults (profile.defaults lists them).
import { currentScope } from '@/lib/scope'
import type { ResolvedProfile } from '@/lib/profile'
import { hrZones, raceHr } from '@/lib/analytics/hr'

export interface Athlete {
  pb: { time: string; race: string; hr: number }   // marathon PB and its average HR
  vo2max: number
  hrMax: number
  zone2: readonly [number, number]
  easyPace: string
  raceHrCap: number
  weightKg: number                                  // for carb-loading amounts
}

const memo = new WeakMap<ResolvedProfile, Athlete>()

export function athlete(p: ResolvedProfile = currentScope().profile): Athlete {
  let a = memo.get(p)
  if (!a) {
    const z2 = hrZones(p)[1]
    a = {
      pb: { time: p.pbTime, race: p.pbRace, hr: p.pbHr }, vo2max: p.vo2max, hrMax: p.hrMax,
      zone2: [z2.min, z2.max] as const, easyPace: p.easyPace, raceHrCap: raceHr(42.195, p).cap, weightKg: p.weightKg,
    }
    memo.set(p, a)
  }
  return a
}
