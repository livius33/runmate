// Athlete facts used across the app (HR model values live in lib/analytics/hr.ts).
// EXAMPLE DEFAULTS — a neutral sample runner, not real data. Edit them for your own install.
// TODO(Phase 2): a per-user profile (user_profile: PB, weight, timezone, locale) replaces this constant.
import { HR_MAX, HR_ZONES, raceHr } from '@/lib/analytics/hr'

export const ATHLETE = {
  pb: { time: '3:30', race: 'Beispiel-Marathon', hr: Math.round(HR_MAX * 0.84) },   // marathon PB and its average HR
  vo2max: 50,
  hrMax: HR_MAX,
  zone2: [HR_ZONES[1].min, HR_ZONES[1].max] as const,
  easyPace: '6:00',
  raceHrCap: raceHr(42.195).cap,
  weightKg: 70,                    // for carb-loading amounts
}
