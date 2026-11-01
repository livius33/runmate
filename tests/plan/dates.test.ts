// Date edge cases: ISO week 53 (28.12.2026–3.1.2027), New Year, clock changes (25.10.2026, 28.3.2027),
// Hamburg midnight. Helpers are run under several process time zones (Vercel = UTC, browser = Berlin).
import { afterAll, describe, expect, it } from 'vitest'
import { differenceInCalendarDays, getISOWeek, parseISO } from 'date-fns'
import { localDate, todayLocal } from '@/lib/dates'
import { datesOf, periodFor } from '@/lib/plan/workshop'
import { weekDates } from '@/lib/plan/effective'
import { isoDay } from '@/lib/plan/athlete-profile'
import { weekOf } from '@/lib/plan/blocks'
import { buildSkeleton } from '@/lib/plan/generator/skeleton'
import { loadMethodology } from '@/lib/plan/methodology/load'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Kiritimati']
const original = process.env.TZ
afterAll(() => { process.env.TZ = original })
const eachZone = (fn: (tz: string) => void) => { for (const tz of ZONES) { process.env.TZ = tz; fn(tz) } }

describe('Hamburg-Datum um Mitternacht und bei Zeitumstellung', () => {
  const cases: [string, string][] = [
    ['2026-10-24T22:30:00Z', '2026-10-25'],   // 00:30 CEST, night of the clock change
    ['2026-10-25T22:30:00Z', '2026-10-25'],   // 23:30 CET, after the change
    ['2026-10-25T23:30:00Z', '2026-10-26'],   // 00:30 CET
    ['2027-03-27T23:30:00Z', '2027-03-28'],   // 00:30 CET, night of the spring change
    ['2027-03-28T21:30:00Z', '2027-03-28'],   // 23:30 CEST
    ['2027-03-28T22:30:00Z', '2027-03-29'],   // 00:30 CEST
    ['2026-12-31T23:30:00Z', '2027-01-01'],   // New Year, 00:30
  ]
  it('todayLocal gibt in jeder Server-Zeitzone das Hamburger Datum', () => {
    eachZone((tz) => {
      for (const [instant, want] of cases) expect({ tz, instant, got: todayLocal(new Date(instant)) }).toEqual({ tz, instant, got: want })
    })
  })
  it('localDate ist lokale Mitternacht des Hamburger Datums', () => {
    eachZone((tz) => {
      for (const [instant, want] of cases) {
        const d = localDate(new Date(instant))
        expect({ tz, y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate(), h: d.getHours() })
          .toEqual({ tz, y: Number(want.slice(0, 4)), m: Number(want.slice(5, 7)), day: Number(want.slice(8)), h: 0 })
      }
    })
  })
})

describe('KW53 und Jahreswechsel', () => {
  it('KW53 2026 läuft von Mo 28.12.2026 bis So 3.1.2027, KW1 2027 beginnt am 4.1.', () => {
    expect([getISOWeek(parseISO('2026-12-28')), getISOWeek(parseISO('2027-01-03')), getISOWeek(parseISO('2027-01-04'))]).toEqual([53, 53, 1])
  })
  it('weekDates: die Woche ab 28.12. hat 7 Tage über Neujahr', () => {
    eachZone((tz) => {
      expect({ tz, d: weekDates({ kw: 53, start: '2026-12-28', end: '2027-01-03', km: 0, focus: '' }) })
        .toEqual({ tz, d: ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'] })
    })
  })
  it('Zeitraum "2 Wochen" ab Silvester beginnt am Montag 28.12. und hat 14 Tage', () => {
    eachZone((tz) => {
      const p = periodFor({ kind: 'weeks', weeks: 2 }, '2026-12-31', [])
      expect({ tz, from: p.from, to: p.to, n: datesOf(p).length }).toEqual({ tz, from: '2026-12-28', to: '2027-01-10', n: 14 })
    })
  })
  it('Zeitraum "bis zum Rennen" über Neujahr (Rennen 1.1. und Februar 2027)', () => {
    eachZone((tz) => {
      for (const race of ['2027-01-01', '2027-02-14']) {
        const p = periodFor({ kind: 'event' }, '2026-12-20', [{ date: race, name: 'Rennen' }])
        const days = datesOf(p)
        expect({ tz, from: p.from, to: p.to, first: days[0], last: days[days.length - 1], n: days.length })
          .toEqual({ tz, from: '2026-12-14', to: race, first: '2026-12-14', last: race,
            n: differenceInCalendarDays(parseISO(race), parseISO('2026-12-14')) + 1 })
      }
    })
  })
  it('von–bis über den Jahreswechsel: Beschriftung mit Jahr, Tage lückenlos', () => {
    eachZone((tz) => {
      const p = periodFor({ kind: 'range', from: '2026-12-21', to: '2027-01-10' }, '2026-12-21', [])
      const days = datesOf(p)
      expect({ tz, label: p.label, n: days.length, unique: new Set(days).size }).toEqual({ tz, label: '21.12.–10.1.2027', n: 21, unique: 21 })
    })
  })
})

describe('Zeitumstellung in Tagesfolgen', () => {
  it('datesOf über 25.10.2026 und 28.3.2027: jeder Kalendertag genau einmal', () => {
    eachZone((tz) => {
      for (const [from, to] of [['2026-10-19', '2026-11-01'], ['2027-03-22', '2027-04-04']]) {
        const days = datesOf({ from, to, label: '' })
        expect({ tz, n: days.length, unique: new Set(days).size, last: days[days.length - 1] }).toEqual({ tz, n: 14, unique: 14, last: to })
      }
    })
  })
  it('isoDay: Wochentag unabhängig von Zeitzone und Zeitumstellung', () => {
    eachZone((tz) => {
      expect({ tz, d: ['2026-10-25', '2026-10-26', '2027-03-28', '2027-01-03'].map(isoDay) }).toEqual({ tz, d: [7, 1, 7, 7] })
    })
  })
})

describe('Porto-Plan endet vor dem Jahreswechsel', () => {
  // Today's plan helpers only know the Porto weeks; the generator (07-02) brings weeks across New Year.
  it('weekOf kennt nach dem 29.11.2026 keine Woche', () => {
    expect([weekOf('2026-11-29')?.kw ?? null, weekOf('2026-11-30'), weekOf('2026-12-28')]).toEqual([48, null, null])
  })
  // Generator (07-02): the week skeleton for the HM 02/2027 example (pfitzinger-half, start 30.11.2026).
  const half = (raceDate: string, start = '2026-11-30') => {
    const r = buildSkeleton({ template: loadMethodology('pfitzinger-half')!.params, distance: 'half', raceDate, start, currentKm: 50, provenKm: 101 })
    if (!r.ok) throw new Error(r.error)
    return r
  }
  it('Generator: ein Plan über KW53 hat KW-Nummern 52 → 53 → 1, KW53 = 28.12.–3.1.', () => {
    eachZone((tz) => {
      const w = half('2027-02-21').weeks
      const i = w.findIndex((x) => x.kw === 53)
      expect({ tz, kws: w.slice(i - 1, i + 2).map((x) => x.kw), start: w[i].start, dates: weekDates({ kw: 53, start: w[i].start, end: '2027-01-03', km: 0, focus: '' }).length })
        .toEqual({ tz, kws: [52, 53, 1], start: '2026-12-28', dates: 7 })
    })
  })
  it('Generator: Rennen am 1.1.2027 — Taper-Wochen laufen über Neujahr, keine Lücke, kein doppelter Tag', () => {
    eachZone((tz) => {
      const w = half('2027-01-01', '2026-10-05').weeks
      const taper = w.filter((x) => x.phase === 'taper').map((x) => x.start)
      const gaps = w.slice(1).filter((x, i) => differenceInCalendarDays(parseISO(x.start), parseISO(w[i].start)) !== 7)
      expect({ tz, taper, gaps: gaps.length, unique: new Set(w.map((x) => x.start)).size === w.length })
        .toEqual({ tz, taper: ['2026-12-21', '2026-12-28'], gaps: 0, unique: true })
    })
  })
  it('Generator: HM im Februar 2027 — Wochenzahl = Kalenderwochen zwischen Start und Rennen (KW53 mitgezählt)', () => {
    eachZone((tz) => {
      const sk = half('2027-02-21')
      expect({ tz, n: sk.weeks.length, taper: sk.phases.taper, recovery: sk.weeks.map((x, i) => (x.kind === 'recovery' ? i + 1 : 0)).filter(Boolean) })
        .toEqual({ tz, n: 12, taper: 2, recovery: [4, 8] })
    })
  })
  it.todo('Engine/Generator: "±2 Tage" über eine Zeitumstellung zählt Kalendertage, nicht 48 Stunden (O-02, engine.ts wasRun)')
})
