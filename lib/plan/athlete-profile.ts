// The runner's training profile from the onboarding (settings 'athlete_profile'). Pure types and helpers;
// the plan workshop respects it (available days, long-run day, max km per day), the generator reads it later.

export type Experience = 'novice' | 'intermediate' | 'advanced' | 'elite'
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7   // ISO: 1 = Montag … 7 = Sonntag

export interface AthleteProfile {
  v: 1
  // 1 Profil
  age: number | null
  weightKg: number | null
  heightCm: number | null
  // 3 Laufhistorie
  experience: Experience | null
  weeklyKm: number | null
  longestRunKm?: number | null     // longest run of the last 4 weeks as stated in the onboarding; stands in while no run is known
  // 4 Zeitplan
  availableDays: Weekday[]
  longRunDay: Weekday | null
  qualityDays: Weekday[]
  kbDays: Weekday[]
  restDay: Weekday | null
  maxKmWeekday: number | null      // Mo–Fr
  maxKmWeekend: number | null      // Sa–So
  // 5 Fitness
  fitnessMethod: 'threshold' | 'fiveK' | null
  thresholdPaceS: number | null    // s/km
  fiveKS: number | null            // s
  savedAt: string | null
}

export const WEEKDAYS: { d: Weekday; short: string; long: string }[] = [
  { d: 1, short: 'Mo', long: 'Montag' }, { d: 2, short: 'Di', long: 'Dienstag' }, { d: 3, short: 'Mi', long: 'Mittwoch' },
  { d: 4, short: 'Do', long: 'Donnerstag' }, { d: 5, short: 'Fr', long: 'Freitag' }, { d: 6, short: 'Sa', long: 'Samstag' },
  { d: 7, short: 'So', long: 'Sonntag' },
]

export const EXPERIENCE_LABEL: Record<Experience, { label: string; description: string }> = {
  novice: { label: 'Einsteiger', description: '0–1 Jahr Lauferfahrung' },
  intermediate: { label: 'Fortgeschritten', description: '1–3 Jahre Lauferfahrung' },
  advanced: { label: 'Erfahren', description: '3–5 Jahre Lauferfahrung' },
  elite: { label: 'Sehr erfahren', description: '5+ Jahre, Marathon-Bestzeit unter 3:15' },
}

// Threshold pace from race pace (research paces.md: threshold ≈ 1-h race pace; marathon pace ≈ threshold + 15 s/km,
// HM pace ≈ threshold − 5…10, 10 km ≈ threshold − 15; convention). Prefill only — the profile form shows it.
export const THRESHOLD_FROM_RACE_S = (d: number) => (d > 30 ? -15 : d > 15 ? 8 : 15)

// The longest run to start from while no run is known (research long-run.md 2.3): the runner's own answer, else the mean
// run of the stated week (a lower bound: one run of the week was at least that long), else nothing.
export function statedLongestKm(p: Pick<AthleteProfile, 'longestRunKm' | 'weeklyKm' | 'availableDays'> | null | undefined): { km: number; source: 'profile' | 'estimate' } | null {
  if (!p) return null
  if (p.longestRunKm != null && p.longestRunKm > 0) return { km: p.longestRunKm, source: 'profile' }
  const days = p.availableDays.length
  if (p.weeklyKm != null && p.weeklyKm > 0 && days > 0) return { km: Math.round((p.weeklyKm / days) * 10) / 10, source: 'estimate' }
  return null
}

export const isoDay = (date: string): Weekday => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay()
  return (d === 0 ? 7 : d) as Weekday
}

// Most km the profile allows on a date (null = no limit).
export function profileMaxKm(p: AthleteProfile | null, date: string): number | null {
  if (!p) return null
  return isoDay(date) >= 6 ? p.maxKmWeekend : p.maxKmWeekday
}

export const dayAvailable = (p: AthleteProfile | null, date: string) => !p || p.availableDays.includes(isoDay(date))

// Allowed range per number field; the onboarding and validProfile share it.
export const RANGES = {
  age: [10, 100], weightKg: [30, 200], heightCm: [120, 230], weeklyKm: [0, 300], longestRunKm: [1, 60],
  maxKmWeekday: [1, 60], maxKmWeekend: [1, 60], thresholdPaceS: [150, 600], fiveKS: [600, 3600],
} as const satisfies Partial<Record<keyof AthleteProfile, readonly [number, number]>>
export type RangedField = keyof typeof RANGES

// Empty is allowed; anything else must be a number inside the field's range.
export const inRange = (k: RangedField, v: unknown) =>
  v == null || (typeof v === 'number' && v >= RANGES[k][0] && v <= RANGES[k][1])

export function validProfile(x: unknown): x is AthleteProfile {
  const p = x as AthleteProfile
  const days = (a: unknown) => Array.isArray(a) && a.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  return !!p && p.v === 1 && days(p.availableDays) && p.availableDays.length > 0 && days(p.qualityDays) && days(p.kbDays)
    && (Object.keys(RANGES) as RangedField[]).every((k) => inRange(k, p[k]))
    && (p.longRunDay == null || days([p.longRunDay])) && (p.restDay == null || days([p.restDay]))
}
