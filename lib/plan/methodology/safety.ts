// Fixed safety limits: no template and no "Mein Ansatz" edit can go beyond these. Pure.
//
// Engine rules no parameter can switch off (enforced in the engine and checked by tests/plan/invariants.ts):
//   · race day and anchors (events) stay where they are; a missed test only moves before the taper (07-11)
//   · past days never change
//   · taper and recovery weeks never gain km
//   · manual edits always win over generated or engine changes
import type { Methodology } from './schema'

export const SAFETY = {
  rampMax: 0.15,              // weekly km may rise at most 15 %, measured against the last load week
  acwrMax: 1.5,               // caution threshold can be stricter, never looser
  tsbFatigue: [-40, -10],     // fatigue threshold must lie in this band
  longRunShareMax: 0.40,      // long run ≤ 40 % of the week
  longRunKmMax: 42,           // a marathon build's longest run rarely exceeds 41 km
  longRunMinutesMax: 240,
  rebalancePctMax: 0.5,       // missed km spread: per day at most +50 % …
  rebalanceKmMax: 8,          // … and at most +8 km
  fatigueShareMin: 0.5,       // a softened session keeps at least half its km
  recoveryVolumeMax: 0.9,     // a recovery week is at least 10 % lighter
  taperVolumeMax: 1,          // taper weeks never above peak
  taperRaceWeekMax: 0.6,      // race week ≤ 60 % of peak (research phases-and-taper.md 2.3)
  taperMeanMax: 0.85,         // a taper cuts at least 15 % on average
  peakOverBaseMax: 2,         // peak ≤ 2 × current weekly km (research peak-and-recovery.md 1.4)
  netGrowthMax: 0.1,          // net weekly growth towards the peak ≤ 10 %
  maxLoadWeeksInRow: 5,       // research load-cycles.md: then a recovery week
  maxRampWeeksInRow: 3,       // at most 3 rising weeks (≥ +3 %) in a row, then the next week holds
  preTaperLoadWeeksMin: 2,    // the last 2 weeks before the taper are load weeks
  longRunSpikeMax: 0.1,       // long run ≤ +10 % on the longest run of the last 30 days (research long-run.md, Frandsen 2025)
  longRunMinKmForHard: 25,    // a long run from 25 km counts as a hard day (research week-layout.md)
  qualityKmPerSessionMax: 0.25, // quality km of one session ≤ 25 % of the week (research workouts-and-intensity.md 3)
  returnWeek1Max: 0.8,        // after Krank/Pause (research adaptation.md 4.3): week 1 ≤ 80 % of the last load week …
  returnWeek2Max: 1,          // … week 2 ≤ 100 % …
  returnLongMax: 0.9,         // … long run ≤ 90 % of the longest before the pause
} as const

export interface SafetyIssue { path: string; message: string }

const pct = (n: number) => `${Math.round(n * 100)} %`
const num = (n: number) => String(n).replace('.', ',')

// Works on raw (not yet validated) data too, so a broken file reports format and safety problems in one go.
export function checkSafety(m: Methodology | unknown): SafetyIssue[] {
  const out: SafetyIssue[] = []
  const get = (path: string): number | undefined => {
    const v = path.split('.').reduce<unknown>((o, k) => (o != null && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), m)
    return typeof v === 'number' ? v : undefined
  }
  const over = (path: string, limit: number, show: (n: number) => string = num) => {
    const v = get(path)
    if (v != null && v > limit) out.push({ path, message: `${show(v)} über der Sicherheitsgrenze ${show(limit)}` })
  }
  const under = (path: string, limit: number, show: (n: number) => string = num) => {
    const v = get(path)
    if (v != null && v < limit) out.push({ path, message: `${show(v)} unter der Sicherheitsgrenze ${show(limit)}` })
  }
  over('volume.ramp_max', SAFETY.rampMax, pct)
  over('adaptation.return.week1_share', SAFETY.returnWeek1Max, pct)
  over('adaptation.return.week2_share', SAFETY.returnWeek2Max, pct)
  over('adaptation.return.long_share', SAFETY.returnLongMax, pct)
  over('volume.recovery_week.volume', SAFETY.recoveryVolumeMax, pct)
  for (let i = 0; i < 4; i++) over(`phases.taper.volume.${i}`, SAFETY.taperVolumeMax, pct)
  const taper = (m as { phases?: { taper?: { volume?: unknown } } })?.phases?.taper?.volume
  if (Array.isArray(taper) && taper.length && taper.every((v) => typeof v === 'number')) {
    const last = taper[taper.length - 1] as number
    const mean = (taper as number[]).reduce((a, b) => a + b, 0) / taper.length
    if (last > SAFETY.taperRaceWeekMax) out.push({ path: 'phases.taper.volume.last', message: `Rennwoche ${pct(last)} über der Sicherheitsgrenze ${pct(SAFETY.taperRaceWeekMax)}` })
    if (mean > SAFETY.taperMeanMax) out.push({ path: 'phases.taper.volume.mean', message: `Taper im Schnitt ${pct(mean)} über der Sicherheitsgrenze ${pct(SAFETY.taperMeanMax)}` })
  }
  over('volume.growth', SAFETY.netGrowthMax, pct)
  over('volume.growth_return', SAFETY.netGrowthMax, pct)
  over('volume.peak.over_base', SAFETY.peakOverBaseMax)
  over('week.long_run.share', SAFETY.longRunShareMax, pct)
  over('week.long_run.max_km', SAFETY.longRunKmMax)
  over('week.long_run.max_minutes', SAFETY.longRunMinutesMax)
  over('adaptation.thresholds.acwr_caution', SAFETY.acwrMax)
  under('adaptation.thresholds.tsb_fatigue', SAFETY.tsbFatigue[0])
  over('adaptation.thresholds.tsb_fatigue', SAFETY.tsbFatigue[1])
  over('adaptation.missed_km.cap_pct', SAFETY.rebalancePctMax, pct)
  over('adaptation.missed_km.cap_km', SAFETY.rebalanceKmMax)
  under('adaptation.fatigue.share', SAFETY.fatigueShareMin, pct)
  return out
}
