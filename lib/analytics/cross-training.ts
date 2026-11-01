// Cross-training (08-01): the sports that are not runs, how Garmin's type keys map to them and how a session is
// validated. Pure. The load per sport lives in load.ts; the research is methodologies/research/cross-training.md.

export type CrossType = 'Strength' | 'Swim' | 'Ride' | 'Gym'
export type Sport = 'run' | 'strength' | 'swim' | 'bike' | 'gym'

// Load mode per sport: strength and swimming by session-RPE (wrist HR understates strength work and is unreliable
// in water); cycling and gym cardio by HR-TRIMP when an average HR exists, else session-RPE.
export const CROSS_SPORTS: Record<CrossType, { sport: Exclude<Sport, 'run'>; label: string; letter: string; load: 'srpe' | 'hr' }> = {
  Strength: { sport: 'strength', label: 'Kraft', letter: 'K', load: 'srpe' },
  Swim: { sport: 'swim', label: 'Schwimmen', letter: 'S', load: 'srpe' },
  Ride: { sport: 'bike', label: 'Rad', letter: 'R', load: 'hr' },
  Gym: { sport: 'gym', label: 'Gym', letter: 'G', load: 'hr' },
}
export const CROSS_TYPES = Object.keys(CROSS_SPORTS) as CrossType[]
export const SPORT_LABEL: Record<Sport, string> = { run: 'Laufen', strength: 'Kraft', swim: 'Schwimmen', bike: 'Rad', gym: 'Gym' }

export function isCrossType(type: string | null | undefined): type is CrossType {
  return !!type && type in CROSS_SPORTS
}

// Garmin activityType.typeKey → stored type. null = not imported (walking, hiking, yoga, …), as before.
const STRENGTH_KEYS = ['strength_training']
const GYM_KEYS = ['indoor_cardio', 'fitness_equipment', 'cardio_training', 'hiit', 'elliptical', 'stair_climbing', 'indoor_rowing', 'rowing']
export function crossTypeForKey(typeKey: string): { type: CrossType; sportType: string } | null {
  const k = typeKey.toLowerCase()
  if (STRENGTH_KEYS.includes(k)) return { type: 'Strength', sportType: typeKey }
  if (k.includes('swim')) return { type: 'Swim', sportType: typeKey }
  if (/cycling|biking|bike|ride|bmx/.test(k)) return { type: 'Ride', sportType: typeKey }
  if (GYM_KEYS.includes(k)) return { type: 'Gym', sportType: typeKey }
  return null
}

export const MANUAL_ID_PREFIX = 'manual-'
export const isManualId = (id: string) => id.startsWith(MANUAL_ID_PREFIX)

export const MINUTES_RANGE = [5, 480] as const
export const RPE_RANGE = [1, 10] as const

export interface CrossEntry { date: string; type: CrossType; minutes: number; rpe: number | null; name: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseRpe(v: unknown): { ok: true; rpe: number | null } | { ok: false; error: string } {
  if (v == null || v === '') return { ok: true, rpe: null }
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < RPE_RANGE[0] || n > RPE_RANGE[1]) return { ok: false, error: 'RPE: ganze Zahl von 1 bis 10' }
  return { ok: true, rpe: n }
}

// A manual session as it comes from the form. `today` bounds the date (the runner's day).
export function parseCrossEntry(body: unknown, today: string): { ok: true; entry: CrossEntry } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'JSON-Objekt erwartet' }
  const b = body as Record<string, unknown>
  const date = String(b.date ?? '')
  if (!DATE_RE.test(date)) return { ok: false, error: 'Datum: als JJJJ-MM-TT' }
  if (date > today) return { ok: false, error: 'Datum liegt in der Zukunft' }
  const type = String(b.sport ?? b.type ?? '')
  if (!isCrossType(type)) return { ok: false, error: 'Sport: Kraft, Schwimmen, Rad oder Gym' }
  const minutes = typeof b.minutes === 'number' ? b.minutes : Number(b.minutes)
  if (!Number.isInteger(minutes) || minutes < MINUTES_RANGE[0] || minutes > MINUTES_RANGE[1]) return { ok: false, error: `Minuten: ganze Zahl von ${MINUTES_RANGE[0]} bis ${MINUTES_RANGE[1]}` }
  const rpe = parseRpe(b.rpe)
  if (!rpe.ok) return rpe
  const name = String(b.name ?? '').trim().slice(0, 80) || CROSS_SPORTS[type].label
  return { ok: true, entry: { date, type, minutes, rpe: rpe.rpe, name } }
}
