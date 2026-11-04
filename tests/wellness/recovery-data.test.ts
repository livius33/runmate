// Baselines, flags and texts from the night, the Apple sleep fallback and the readiness line. Pure.
import { describe, expect, it } from 'vitest'
import {
  HRV_DROP, MIN_BASELINE_NIGHTS, RHR_RISE, SHORT_SLEEP_S, baseline, lastNightLine, recoveryCounts, recoveryDay, withAppleSleep,
  type WellnessNight,
} from '@/lib/analytics/recovery-data'
import { wellnessLine } from '@/lib/insights/wellness'
import { DATE, day, history, night } from './fixtures'

describe('Basis', () => {
  it('Median der Garmin-Nächte der 28 Tage davor, der Morgen selbst zählt nicht', () => {
    const b = baseline([...history(10), night(DATE, { hrvAvg: 20, rhr: 90 }), night(day(-40), { hrvAvg: 10 })], DATE)
    expect(b).toEqual({ nights: 10, ready: true, hrv: 64, rhr: 49 })
  })

  it('leere Nächte, Apple-Schlaf und Tages-Ruhepuls zählen nicht', () => {
    const rows = [...history(6),
      night(day(-8), { sleepS: null, hrvAvg: null, rhr: null, rhrSource: null }),
      night(day(-9), { hrvAvg: null, rhr: 70, rhrSource: 'day' }),
      night(day(-10), { hrvAvg: null, rhr: null, rhrSource: null, sleepSource: 'apple' })]
    expect(baseline(rows, DATE)).toMatchObject({ nights: 6, ready: false, hrv: null, rhr: null })
  })
})

describe('Flags am Morgen', () => {
  const rows = (o: Partial<WellnessNight>) => [...history(MIN_BASELINE_NIGHTS), night(DATE, o)]

  it('Schwellen: < 6 h · HRV < Basis − 15 % · Ruhepuls > Basis + 5', () => {
    expect(recoveryDay(rows({}), DATE).flags).toEqual([])
    expect(recoveryDay(rows({ sleepS: SHORT_SLEEP_S - 60 }), DATE).flags).toEqual(['sleep'])
    expect(recoveryDay(rows({ sleepS: SHORT_SLEEP_S }), DATE).flags).toEqual([])
    const lowHrv = Math.floor(64 * (1 - HRV_DROP)) - 1
    expect(recoveryDay(rows({ hrvAvg: lowHrv }), DATE).flags).toEqual(['hrv'])
    expect(recoveryDay(rows({ hrvAvg: Math.ceil(64 * (1 - HRV_DROP)) }), DATE).flags).toEqual([])
    expect(recoveryDay(rows({ rhr: 49 + RHR_RISE + 1 }), DATE).flags).toEqual(['rhr'])
    expect(recoveryDay(rows({ rhr: 49 + RHR_RISE }), DATE).flags).toEqual([])
    expect(recoveryDay(rows({ hrvAvg: lowHrv, rhr: 56 }), DATE).flags).toEqual(['hrv', 'rhr'])
  })

  it('Garmin-Status LOW / UNBALANCED zählt als HRV niedrig', () => {
    expect(recoveryDay(rows({ hrvStatus: 'LOW' }), DATE).flags).toEqual(['hrv'])
    expect(recoveryDay(rows({ hrvStatus: 'UNBALANCED' }), DATE).flags).toEqual(['hrv'])
    expect(recoveryDay(rows({ hrvStatus: 'BALANCED' }), DATE).flags).toEqual([])
  })

  it('weniger als 7 Nächte: nur das Schlaf-Flag', () => {
    const few = [...history(MIN_BASELINE_NIGHTS - 1), night(DATE, { sleepS: 5 * 3600, hrvAvg: 30, hrvStatus: 'LOW', rhr: 70 })]
    const r = recoveryDay(few, DATE)
    expect(r.flags).toEqual(['sleep'])
    expect(r.baseline).toMatchObject({ nights: 6, ready: false })
  })

  it('Tages-Ruhepuls (Fallback) setzt kein Flag', () => {
    expect(recoveryDay(rows({ rhr: 70, rhrSource: 'day' }), DATE).flags).toEqual([])
  })

  it('zählt als müde erst mit 2 Flags', () => {
    expect(recoveryCounts({ date: '2026-11-09', flags: ['hrv', 'rhr'] })).toBe(true)
    expect(recoveryCounts({ date: '2026-11-08', flags: ['hrv', 'rhr', 'sleep'] })).toBe(true)
    expect(recoveryCounts({ date: '2026-11-20', flags: ['hrv'] })).toBe(false)
    expect(recoveryCounts({ date: '2026-11-20', flags: [] })).toBe(false)
    expect(recoveryCounts(undefined)).toBe(false)
  })
})

describe('Apple Health als Fallback', () => {
  it('füllt nur die Schlafdauer eines Morgens ohne Garmin-Nacht, markiert; HRV/Ruhepuls bleiben Garmin', () => {
    const g = [night(day(-1)), night(DATE, { sleepS: null, hrvAvg: null, rhr: null, rhrSource: null })]
    const merged = withAppleSleep(g, [{ date: DATE, sleepMin: 330 }, { date: day(-1), sleepMin: 300 }, { date: day(-2), sleepMin: 410 }, { date: day(-3), sleepMin: null }])
    expect(merged.map((n) => [n.date, n.sleepS, n.sleepSource ?? 'garmin'])).toEqual([
      [day(-2), 410 * 60, 'apple'], [day(-1), 7.5 * 3600, 'garmin'], [DATE, 330 * 60, 'apple'],
    ])
    expect(recoveryDay(merged, DATE).flags).toEqual(['sleep'])         // 5:30 h < 6 h, also from Apple
  })
})

describe('Heute-Zeile', () => {
  it('"Letzte Nacht: 6:40 h · HRV 58 (Basis 64) · Ruhepuls 52 (Basis 49)", markierte Werte amber', () => {
    const l = lastNightLine(recoveryDay([...history(10), night(DATE, { sleepS: 6 * 3600 + 40 * 60, hrvAvg: 58, rhr: 52 })], DATE))
    expect(l.text).toBe('Letzte Nacht: 6:40 h · HRV 58 (Basis 64) · Ruhepuls 52 (Basis 49)')
    expect(l.parts.filter((p) => p.flagged)).toEqual([])
    const bad = lastNightLine(recoveryDay([...history(10), night(DATE, { sleepS: 5 * 3600 + 5 * 60, hrvAvg: 50, rhr: 56 })], DATE))
    expect(bad.text).toBe('Letzte Nacht: 5:05 h · HRV 50 (Basis 64) · Ruhepuls 56 (Basis 49)')
    expect(bad.parts.map((p) => p.flagged)).toEqual([true, true, true])
    expect(bad.muted).toBe(false)
  })

  it('keine Daten für letzte Nacht: "Keine Schlafdaten – Uhr nachts tragen" (gedämpft)', () => {
    const l = lastNightLine(recoveryDay(history(10), DATE))
    expect(l).toMatchObject({ text: 'Keine Schlafdaten – Uhr nachts tragen', muted: true })
    expect(l.parts.some((p) => p.flagged)).toBe(false)
  })

  it('Basis im Aufbau, Apple-Schlaf und Tages-Ruhepuls werden benannt', () => {
    expect(lastNightLine(recoveryDay([...history(3), night(DATE, { sleepS: 7 * 3600, rhr: 51 })], DATE)).text)
      .toBe('Letzte Nacht: 7:00 h · HRV 64 · Ruhepuls 51 · Basis wird aufgebaut (3/7 Nächte)')
    const apple = night(DATE, { sleepS: 6.5 * 3600, sleepSource: 'apple', hrvAvg: null, rhr: 60, rhrSource: 'day' })
    expect(lastNightLine(recoveryDay([...history(10), apple], DATE)).text).toBe('Letzte Nacht: 6:30 h (Apple) · Ruhepuls 60 (Tag)')
  })
})

describe('Erholungs-Zeile (Rennbereitschaft / Erholung)', () => {
  it('7-Nächte-Schnitt gegen die Basis', () => {
    const rows = history(20, day(1))                                   // nights up to and including DATE
    expect(wellnessLine(rows, DATE)).toEqual({ tone: 'ok', label: 'Erholung', text: 'Schlaf Ø 7:30 h (7 Nächte) · HRV 64 (Basis 64) · Ruhepuls 49 (Basis 49): im Rahmen deiner Basis.' })
  })

  it('schwache Woche → warn mit Grund; ohne Daten → offen', () => {
    const base = history(20, day(-6))
    const week = Array.from({ length: 7 }, (_, i) => night(day(-i), { sleepS: 5.5 * 3600, hrvAvg: 50, rhr: 56 }))
    const l = wellnessLine([...base, ...week], DATE)
    expect(l.tone).toBe('warn')
    expect(l.text).toContain('zu wenig Schlaf, HRV unter deiner Basis, Ruhepuls über deiner Basis')
    expect(wellnessLine([], DATE)).toEqual({ tone: 'open', label: 'Erholung', text: 'keine Schlafdaten der letzten 7 Nächte – Uhr nachts tragen.' })
    expect(wellnessLine(history(3, day(1)), DATE).text).toContain('Basis wird aufgebaut (2/7 Nächte)')
  })
})
