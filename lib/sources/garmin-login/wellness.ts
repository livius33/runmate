// Garmin nights: one dailySleepData request per morning, parsed defensively. The response carries dailySleepDTO
// (sleepTimeSeconds, deep/REM, sleepScores) and, when the watch recorded the night, avgOvernightHrv, hrvStatus and
// restingHeartRate. A night without the watch comes back with sleepTimeSeconds null. Pure apart from `fetchNight`.
import type { WellnessNight } from '@/lib/sources/types'

const API = 'https://connectapi.garmin.com'
// The URLs garmin-connect 1.6.2 uses for getSleepData / getHeartRate, with the calendar day as given (no Date, so
// no server time zone in between).
export const sleepUrl = (date: string) => `${API}/sleep-service/sleep/dailySleepData?date=${date}`
export const heartRateUrl = (date: string) => `${API}/wellness-service/wellness/dailyHeartRate?date=${date}`

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' ? (v as Obj) : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null)

export const emptyNight = (date: string): WellnessNight =>
  ({ date, sleepS: null, deepS: null, remS: null, sleepScore: null, hrvAvg: null, hrvStatus: null, rhr: null, rhrSource: null })

export function parseSleepData(raw: unknown, date: string): WellnessNight {
  const r = obj(raw)
  const dto = obj(r?.dailySleepDTO)
  if (!r || !dto) return emptyNight(date)
  const sleepS = num(dto.sleepTimeSeconds)
  const status = typeof r.hrvStatus === 'string' && r.hrvStatus.trim() ? r.hrvStatus.trim().toUpperCase() : null
  const rhr = num(r.restingHeartRate)
  return {
    date,
    sleepS,
    deepS: num(dto.deepSleepSeconds),
    remS: num(dto.remSleepSeconds),
    sleepScore: num(obj(obj(dto.sleepScores)?.overall)?.value),
    hrvAvg: num(r.avgOvernightHrv),
    hrvStatus: status,
    rhr,
    // Without a recorded night the resting HR in the response is the day's value (unreliable as a night value).
    rhrSource: rhr == null ? null : sleepS != null ? 'night' : 'day',
  }
}

export const parseRestingHr = (raw: unknown) => num(obj(raw)?.restingHeartRate)

// One night: the sleep request; the daily heart rate only when a recorded night has no resting HR (and a request is
// left). The fallback is optional: its failure keeps the night as it is, unless Garmin brakes or the login is gone.
export async function fetchGarminNight(get: (url: string) => Promise<unknown>, date: string, requestsLeft = 2): Promise<{ night: WellnessNight; requests: number }> {
  const night = parseSleepData(await get(sleepUrl(date)), date)
  if (night.sleepS == null || night.rhr != null || requestsLeft < 2) return { night, requests: 1 }
  try {
    const rhr = parseRestingHr(await get(heartRateUrl(date)))
    return { night: rhr ? { ...night, rhr, rhrSource: 'day' } : night, requests: 2 }
  } catch (err: any) {
    if (err?.code === 'rate-limited' || err?.code === 'not-connected') throw err
    return { night, requests: 2 }
  }
}
