// The onboarding's profile step (Phase 5) → the two stored profiles: the HR model / time zone (lib/profile.ts, table
// user_profile) and the training profile the generator reads (lib/plan/athlete-profile.ts, settings 'athlete_profile').
// Pure. "Weiß ich nicht" for HFmax: estimated from the age (research paces.md §2.2); for the resting HR: left empty,
// so the example default applies and is marked as such.
import { validateProfile, type UserProfile } from '@/lib/profile'
import { RANGES, THRESHOLD_FROM_RACE_S, validProfile, type AthleteProfile, type Experience, type Weekday } from '@/lib/plan/athlete-profile'

export const RACE_DISTANCES = { '5k': 5, '10k': 10, half: 21.0975, marathon: 42.195 } as const
export type RaceDistance = keyof typeof RACE_DISTANCES
export const RACE_LABEL: Record<RaceDistance, string> = { '5k': '5 km', '10k': '10 km', half: 'Halbmarathon', marathon: 'Marathon' }

export interface ProfileInput {
  hrMax: number | null
  hrMaxUnknown: boolean          // "weiß ich nicht" → estimate from the age
  age: number | null
  hrRest: number | null          // null = "weiß ich nicht" (example default, marked)
  race: { distance: RaceDistance; time: string } | null   // best or recent race
  weightKg: number | null
  timezone: string | null        // the browser's, editable
  weeklyKm: number | null
  experience: Experience | null
  runDays: Weekday[]
  longRunDay: Weekday | null
}

// HFmax from age (Tanaka, Monahan & Seals 2001: 208 − 0,7 × Alter); individual values scatter by about ±10 bpm.
export const HRMAX_AGE = [14, 90] as const
export const estimateHrMax = (age: number) => Math.round(208 - 0.7 * age)
export const HRMAX_ESTIMATE_NOTE = 'HFmax geschätzt aus dem Alter (208 − 0,7 × Alter). Die echte HFmax kann gut 10 Schläge darüber oder darunter liegen – trag sie in den Einstellungen ein, sobald du sie kennst (z. B. aus einem harten Rennen).'

const CLOCK = /^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/
export function parseRaceTime(t: string): number | null {
  const m = t.trim().match(CLOCK)
  if (!m) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}
const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export type BuiltProfile = { ok: true; user: UserProfile; athlete: AthleteProfile; notes: string[] } | { ok: false; error: string }

export function buildProfiles(i: ProfileInput, existing: AthleteProfile | null = null): BuiltProfile {
  const notes: string[] = []
  if (i.age != null && (!Number.isFinite(i.age) || i.age < RANGES.age[0] || i.age > RANGES.age[1])) return { ok: false, error: 'Alter: bitte 10–100.' }
  let hrMax = i.hrMax
  if (i.hrMaxUnknown) {
    if (i.age == null || i.age < HRMAX_AGE[0] || i.age > HRMAX_AGE[1]) return { ok: false, error: `Für die Schätzung der HFmax brauchen wir dein Alter (${HRMAX_AGE[0]}–${HRMAX_AGE[1]}).` }
    hrMax = estimateHrMax(i.age)
    notes.push(HRMAX_ESTIMATE_NOTE)
  }

  // Best or recent race: the marathon is the profile's PB; any race sets the threshold pace (or the 5 km time).
  let pbTime: string | null = null, pbRace: string | null = null
  let fitness: Pick<AthleteProfile, 'fitnessMethod' | 'thresholdPaceS' | 'fiveKS'> = { fitnessMethod: null, thresholdPaceS: null, fiveKS: null }
  if (i.race) {
    const km = RACE_DISTANCES[i.race.distance]
    const s = parseRaceTime(i.race.time)
    if (!km || s == null) return { ok: false, error: 'Rennzeit: bitte als h:mm:ss oder mm:ss.' }
    const pace = s / km
    if (pace < 150 || pace > 600) return { ok: false, error: 'Rennzeit: die Zeit passt nicht zur Distanz.' }
    if (i.race.distance === 'marathon') { pbTime = hms(s); pbRace = 'Marathon' }
    fitness = i.race.distance === '5k'
      ? { fitnessMethod: 'fiveK', thresholdPaceS: null, fiveKS: s }
      : { fitnessMethod: 'threshold', thresholdPaceS: Math.round(pace + THRESHOLD_FROM_RACE_S(km)), fiveKS: null }
  }

  const user = validateProfile({ hrMax, hrRest: i.hrRest, pbTime, pbRace, weightKg: i.weightKg, timezone: i.timezone, locale: 'de' })
  if (!user.ok) return user

  const runDays = [...new Set(i.runDays)].filter((d) => d >= 1 && d <= 7).sort() as Weekday[]
  if (!runDays.length) return { ok: false, error: 'Bitte mindestens einen Lauftag wählen.' }
  const longRunDay = i.longRunDay && runDays.includes(i.longRunDay) ? i.longRunDay : runDays.includes(7) ? 7 : runDays[runDays.length - 1]
  // Quality days: never the long-run day or the day after it, not next to each other (lib/plan/generator/days.ts
  // keeps its own checks; this only seeds the profile like the Plan-Werkstatt's onboarding).
  const afterLong = ((longRunDay % 7) + 1) as Weekday
  const qualityDays: Weekday[] = []
  for (const d of runDays) {
    if (d === longRunDay || d === afterLong || qualityDays.some((q) => Math.abs(q - d) < 2)) continue
    if (qualityDays.length < 2) qualityDays.push(d)
  }
  const athlete: AthleteProfile = {
    v: 1, age: i.age, weightKg: i.weightKg, heightCm: existing?.heightCm ?? null, experience: i.experience,
    weeklyKm: i.weeklyKm, availableDays: runDays, longRunDay, qualityDays, kbDays: existing?.kbDays ?? [],
    restDay: ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).find((d) => !runDays.includes(d) && d !== afterLong) ?? null,
    maxKmWeekday: existing?.maxKmWeekday ?? null, maxKmWeekend: existing?.maxKmWeekend ?? null,
    ...fitness, savedAt: null,
  }
  if (!validProfile(athlete)) return { ok: false, error: 'Wochenkilometer: bitte 0–300.' }
  return { ok: true, user: user.profile, athlete, notes }
}
