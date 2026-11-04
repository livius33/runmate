// Recovery from the night: baselines from the runner's own nights and three plain flags per morning. Pure.
// Nights from a pull source (the Garmin login) first; Apple Health only fills the sleep duration of a morning without
// such a night — Apple's HRV (SDNN) and resting HR are other measures and never enter the baselines.
import { addDays, format, parseISO } from 'date-fns'
import type { WellnessNight } from '@/lib/sources/types'

export type { WellnessNight }

// Under 6 h: clearly short (methodologies/research/modifiers.md §4: a readiness flag is sleep < 6 h).
export const SHORT_SLEEP_S = 6 * 3600
// Fixed bands against the own 28-day median: traceable numbers instead of a statistical band.
// methodologies/research/modifiers.md §4 proposes mean − 1 SD for HRV (Vesterinen 2016, individual band); with
// typical night-to-night spread that is of the same order as −15 %.
export const HRV_DROP = 0.15
// Resting HR 5 bpm above the own median (a delta, not an HR model value): a conservative, widely used practical sign
// of incomplete recovery (or a beginning illness); a single high night alone never changes the plan (TIRED_FLAGS).
export const RHR_RISE = 5
// The source's own HRV status (Garmin needs its 3-week baseline): these count as low.
export const LOW_HRV_STATUS = ['LOW', 'UNBALANCED', 'POOR']
export const BASELINE_DAYS = 28
export const MIN_BASELINE_NIGHTS = 7
export const TIRED_FLAGS = 2          // flags on one morning that count as "müde" (same guard as TSB/ACWR)

export type RecoveryFlag = 'sleep' | 'hrv' | 'rhr'
export const FLAG_LABEL: Record<RecoveryFlag, string> = { sleep: 'kurz geschlafen', hrv: 'HRV niedrig', rhr: 'Ruhepuls hoch' }

export interface Baseline { nights: number; ready: boolean; hrv: number | null; rhr: number | null }
export interface RecoveryDay { date: string; night?: WellnessNight; baseline: Baseline; flags: RecoveryFlag[] }

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
const nightRhr = (n: WellnessNight) => (n.rhrSource === 'night' ? n.rhr : null)
// A recorded night (watch worn): what the baseline counts.
const isRecordedNight = (n: WellnessNight) => n.hrvAvg != null || nightRhr(n) != null
export const hasData = (n: WellnessNight) => n.sleepS != null || n.hrvAvg != null || n.rhr != null

// Apple sleep duration for mornings without a night from the pull source, marked; everything else stays as it is.
export function withAppleSleep(pulled: WellnessNight[], apple: { date: string; sleepMin: number | null }[]): WellnessNight[] {
  const byDate = new Map(pulled.map((n) => [n.date, n]))
  for (const a of apple) {
    if (!a.sleepMin || a.sleepMin <= 0) continue
    const g = byDate.get(a.date)
    if (g?.sleepS != null) continue
    const base = g ?? { date: a.date, sleepS: null, deepS: null, remS: null, sleepScore: null, hrvAvg: null, hrvStatus: null, rhr: null, rhrSource: null }
    byDate.set(a.date, { ...base, sleepS: Math.round(a.sleepMin * 60), sleepSource: 'apple' })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// Baseline for a morning: median of the recorded nights in the 28 days before it (that morning not included).
export function baseline(nights: WellnessNight[], date: string): Baseline {
  const from = day(date, -BASELINE_DAYS)
  const prior = nights.filter((n) => n.date >= from && n.date < date && isRecordedNight(n))
  const ready = prior.length >= MIN_BASELINE_NIGHTS
  const hrvs = prior.flatMap((n) => (n.hrvAvg != null ? [n.hrvAvg] : []))
  const rhrs = prior.flatMap((n) => (nightRhr(n) != null ? [nightRhr(n)!] : []))
  return {
    nights: prior.length, ready,
    hrv: ready && hrvs.length >= MIN_BASELINE_NIGHTS ? median(hrvs) : null,
    rhr: ready && rhrs.length >= MIN_BASELINE_NIGHTS ? median(rhrs) : null,
  }
}

export const hrvLow = (hrv: number | null, b: Baseline, status?: string | null) =>
  b.ready && ((hrv != null && b.hrv != null && hrv < b.hrv * (1 - HRV_DROP)) || (!!status && LOW_HRV_STATUS.includes(status)))
export const rhrHigh = (rhr: number | null, b: Baseline) => b.ready && rhr != null && b.rhr != null && rhr > b.rhr + RHR_RISE

// The morning of `date`: last night and its flags. Fewer than 7 baseline nights: the sleep flag only.
export function recoveryDay(nights: WellnessNight[], date: string): RecoveryDay {
  const b = baseline(nights, date)
  const night = nights.find((n) => n.date === date && hasData(n))
  if (!night) return { date, baseline: b, flags: [] }
  const flags: RecoveryFlag[] = []
  if (night.sleepS != null && night.sleepS < SHORT_SLEEP_S) flags.push('sleep')
  if (hrvLow(night.hrvAvg, b, night.hrvStatus)) flags.push('hrv')
  if (rhrHigh(nightRhr(night), b)) flags.push('rhr')
  return { date, night, baseline: b, flags }
}

export const flagsText = (flags: RecoveryFlag[]) => flags.map((f) => FLAG_LABEL[f]).join(', ')
export const recoveryWhy = (flags: RecoveryFlag[]) => `Erholung schwach (${flagsText(flags)})`

// The engine's view of a morning (Fitness.recovery): counts as "müde" with ≥ 2 flags.
export interface RecoveryFitness { date: string; flags: RecoveryFlag[] }
export const recoveryCounts = (r: RecoveryFitness | undefined) => !!r && r.flags.length >= TIRED_FLAGS

// "6:40 h"
export const fmtSleep = (s: number) => {
  const m = Math.round(s / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`
}

export interface NightPart { text: string; flagged: boolean }
export interface NightLine { text: string; parts: NightPart[]; muted: boolean }

// Heute-Karte: "Letzte Nacht: 6:40 h · HRV 58 (Basis 64) · Ruhepuls 52 (Basis 49)", flagged parts in amber.
export function lastNightLine(r: RecoveryDay): NightLine {
  const n = r.night
  if (!n) return { text: 'Keine Schlafdaten – Uhr nachts tragen', parts: [{ text: 'Keine Schlafdaten – Uhr nachts tragen', flagged: false }], muted: true }
  const b = r.baseline
  const parts: NightPart[] = []
  if (n.sleepS != null) parts.push({ text: `${fmtSleep(n.sleepS)}${n.sleepSource === 'apple' ? ' (Apple)' : ''}`, flagged: r.flags.includes('sleep') })
  if (n.hrvAvg != null) parts.push({ text: `HRV ${n.hrvAvg}${b.hrv != null ? ` (Basis ${b.hrv})` : ''}`, flagged: r.flags.includes('hrv') })
  else if (r.flags.includes('hrv')) parts.push({ text: `HRV-Status ${n.hrvStatus}`, flagged: true })
  if (n.rhr != null) parts.push({ text: `Ruhepuls ${n.rhr}${n.rhrSource === 'day' ? ' (Tag)' : b.rhr != null ? ` (Basis ${b.rhr})` : ''}`, flagged: r.flags.includes('rhr') })
  if (!b.ready) parts.push({ text: `Basis wird aufgebaut (${b.nights}/${MIN_BASELINE_NIGHTS} Nächte)`, flagged: false })
  return { text: `Letzte Nacht: ${parts.map((p) => p.text).join(' · ')}`, parts, muted: false }
}

// Last 7 mornings (today included): averages against today's baseline, for the readiness / Erholung cards.
export function recoveryWeek(nights: WellnessNight[], today: string) {
  const recent = nights.filter((n) => n.date > day(today, -7) && n.date <= today && hasData(n))
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((t, x) => t + x, 0) / xs.length) : null)
  const sleeps = recent.flatMap((n) => (n.sleepS != null ? [n.sleepS] : []))
  return {
    nights: recent.length,
    sleepNights: sleeps.length,
    sleepS: avg(sleeps),
    hrv: avg(recent.flatMap((n) => (n.hrvAvg != null ? [n.hrvAvg] : []))),
    rhr: avg(recent.flatMap((n) => (nightRhr(n) != null ? [nightRhr(n)!] : []))),
    baseline: baseline(nights, today),
  }
}
