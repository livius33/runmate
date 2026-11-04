// Synthetic nights for the wellness tests: ordinary nights around HRV 64 / resting HR 49, and one morning to vary.
import type { WellnessNight } from '@/lib/analytics/recovery-data'

export const DATE = '2026-11-20'
export const day = (n: number, from = DATE) => new Date(Date.parse(`${from}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
export const night = (date: string, o: Partial<WellnessNight> = {}): WellnessNight => ({
  date, sleepS: 7.5 * 3600, deepS: 5000, remS: 6000, sleepScore: 82, hrvAvg: 64, hrvStatus: 'BALANCED', rhr: 49, rhrSource: 'night', ...o,
})
// n ordinary nights before `date` (HRV 62/64/66 around 64, resting HR 48/49/50 around 49)
export const history = (n: number, date = DATE) =>
  Array.from({ length: n }, (_, i) => night(day(-1 - i, date), { hrvAvg: 62 + (i % 3) * 2, rhr: 48 + (i % 3) }))

