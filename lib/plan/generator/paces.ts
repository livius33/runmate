// Training paces (07-13): one anchor (the race pace) and the template's offsets. The anchor comes from the template's
// `paces.source`: the goal time, the profile's threshold test, or a recent race predicted with Riegel (1,06; +2 % for a
// marathon from ≤ HM, Vickers & Vertosick 2016). Plausibility warnings only. Research: methodologies/research/paces.md 1.2.
// Pure.
import type { Distance, Methodology } from '../methodology/schema'
import { PACE_NAMES } from '../methodology/schema'
import type { AthleteProfile } from '../athlete-profile'

export interface PacesInput {
  template: Methodology
  distance: Distance
  goalS: number                                     // goal finish time, s
  profile: AthleteProfile | null
  recentRace?: { distanceKm: number; timeS: number; date: string } | null   // best recent race (≤ 6 months)
}
export interface Paces {
  racePaceS: number                                 // the anchor, s/km (rounded to the second)
  goalPaceS: number
  predictedPaceS: number | null                     // from the recent race
  source: 'goal_time' | 'threshold' | 'race'
  paces: Record<string, number>                     // every pace name → s/km
  fmt: Record<string, string>                       // the same as m:ss
  warnings: string[]
}

export const RACE_KM: Record<Distance, number> = { marathon: 42.195, half: 21.0975, '10k': 10 }
const RIEGEL = 1.06
const MARATHON_CORRECTION = 1.02                    // Riegel underestimates marathons from shorter races (approximation)
const GOAL_WARN = [0.03, 0.06]                      // goal faster than the prediction by more than 3 % / 6 %
const THRESHOLD_DIFF_S = 8
// A template may leave names out; they fall back to the nearest defined pace.
const FALLBACK: Record<string, string[]> = {
  recovery: ['easy'], long: ['easy'], strides: ['intervals_vo2', 'threshold'], half_marathon_pace: ['threshold'],
  marathon_pace: ['half_marathon_pace', 'threshold'], intervals_vo2: ['threshold'], threshold: ['half_marathon_pace'], easy: ['long'],
}

export const fmtPace = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`
const clock = (s: number) => { const r = Math.round(s); return `${Math.floor(r / 3600)}:${String(Math.floor((r % 3600) / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}` }

export function predictTimeS(race: { distanceKm: number; timeS: number }, distance: Distance) {
  const D = RACE_KM[distance]
  const t = race.timeS * Math.pow(D / race.distanceKm, RIEGEL)
  return distance === 'marathon' && race.distanceKm <= 21.1 ? t * MARATHON_CORRECTION : t
}

export function trainingPaces(input: PacesInput): Paces {
  const t = input.template
  const D = RACE_KM[input.distance]
  const off = t.paces.offsets
  const warnings: string[] = []
  const goalPaceS = input.goalS / D
  const predictedS = input.recentRace ? predictTimeS(input.recentRace, input.distance) : null
  const predictedPaceS = predictedS == null ? null : predictedS / D

  let source: Paces['source'] = 'goal_time'
  let racePace = goalPaceS
  let fromGoal: string | null = null                // why the template's own source is missing; one hint, not two
  if (t.paces.source === 'threshold' && input.profile?.thresholdPaceS) {
    source = 'threshold'
    racePace = input.profile.thresholdPaceS - (off.threshold ?? 0)
  } else if (t.paces.source === 'vdot') {
    // No VDOT tables yet: the race is carried to the goal distance with Riegel.
    if (predictedPaceS != null) { source = 'race'; racePace = predictedPaceS; warnings.push('Tempi aus deinem letzten Wettkampf, auf die Zieldistanz umgerechnet (Riegel-Formel).') }
    else fromGoal = 'Kein Wettkampf aus den letzten 6 Monaten'
  } else if (t.paces.source === 'threshold') fromGoal = 'Kein Schwellentest im Profil'
  const racePaceS = Math.round(racePace)

  // Plausibility: goal vs. the prediction from a recent race; threshold test vs. that prediction; nothing measured.
  if (predictedPaceS != null && predictedS != null) {
    const faster = 1 - goalPaceS / predictedPaceS
    const pct = Math.round(faster * 100)
    if (faster > GOAL_WARN[1]) warnings.push(`Ziel ${clock(input.goalS)} liegt ${pct} % über deiner aktuellen Form (${clock(predictedS)}) – Plan B prüfen.`)
    else if (faster > GOAL_WARN[0]) warnings.push(`Ziel ${clock(input.goalS)} liegt ${pct} % über deiner aktuellen Form (${clock(predictedS)}).`)
    const tt = input.profile?.thresholdPaceS
    if (tt && off.threshold != null && Math.abs(tt - (predictedPaceS + off.threshold)) > THRESHOLD_DIFF_S) {
      warnings.push(`Schwellentest (${fmtPace(tt)}) und Wettkampf (${fmtPace(predictedPaceS + off.threshold)}) passen nicht zusammen.`)
    }
  } else if (fromGoal) {
    warnings.push(`${fromGoal}: die Tempi kommen aus deiner Zielzeit. Ein Testlauf in Woche 2–3 zeigt, ob sie passen.`)
    fromGoal = null
  } else if (!input.profile?.thresholdPaceS) warnings.push('Keine aktuelle Zeit: Tempi aus der Zielzeit – Test in Woche 2–3 einplanen.')
  if (fromGoal) warnings.push(`${fromGoal}: die Tempi kommen aus deiner Zielzeit.`)

  const paces: Record<string, number> = {}
  for (const name of PACE_NAMES) {
    const own = off[name]
    const alt = own ?? (FALLBACK[name] ?? []).map((n) => off[n as keyof typeof off]).find((v) => v != null)
    paces[name] = racePaceS + (alt ?? 0)
  }
  const fmt = Object.fromEntries(Object.entries(paces).map(([k, v]) => [k, fmtPace(v)]))
  return { racePaceS, goalPaceS, predictedPaceS, source, paces, fmt, warnings }
}
