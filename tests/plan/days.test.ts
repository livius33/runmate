// Generator step 2 (07-03): day plan from the week skeleton. Porto weekly pattern, HM 02/2027 example, long-run rules,
// race week, profiles with few days and day caps. Rules: methodologies/research/{week-layout,long-run,phases-and-taper}.md.
import { describe, expect, it } from 'vitest'
import { getISODay, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { describePlan } from '@/lib/plan/methodology/describe'
import { compareToTemplate } from '@/lib/plan/methodology/compare'
import { buildSkeleton, type Skeleton, type SkeletonInput } from '@/lib/plan/generator/skeleton'
import { buildDays, type DaysInput, type DaysPlan } from '@/lib/plan/generator/days'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { checkDays } from './days-check'
import { portoTemplate } from '@/examples/porto-2026/template'

const template = (id: string) => listMethodologies().valid.find((m) => m.id === id)!.params
const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: 248, fiveKS: null, savedAt: null,
}
const skeleton = (input: SkeletonInput): Skeleton => {
  const r = buildSkeleton(input)
  if (!r.ok) throw new Error(r.error)
  return r
}
const days = (sk: Skeleton, input: DaysInput): DaysPlan => {
  const r = buildDays(sk, input)
  if (!r.ok) throw new Error(r.error)
  expect(checkDays(r, sk, input)).toEqual([])
  return r
}
const longs = (p: DaysPlan) => p.sessions.filter((s) => s.type === 'long')
const weekday = (d: string) => getISODay(parseISO(d))

const portoSk = skeleton({ template: portoTemplate().params, distance: 'marathon', raceDate: '2026-11-08', start: '2026-06-22', currentKm: 64, provenKm: 64, peakKm: 126 })
const portoIn: DaysInput = { template: portoTemplate().params, distance: 'marathon', raceDate: '2026-11-08', raceName: 'Porto-Marathon',
  racePaceS: 263, profile: RUNNER, longest30Km: 21, longest12mKm: 42.2 }
const hmSk = skeleton({ template: template('pfitzinger-half'), distance: 'half', raceDate: '2027-02-21', start: '2026-11-30', currentKm: 50, provenKm: 101 })
const hmIn: DaysInput = { template: template('pfitzinger-half'), distance: 'half', raceDate: '2027-02-21', racePaceS: 241, profile: RUNNER, longest30Km: 16 }

describe('Wochenmuster des Beispielprofils (AC-1)', () => {
  const p = days(portoSk, portoIn)

  it('Mo locker · Di Qualität · Mi locker · Do locker · Fr Ruhe · Sa Longrun · So Regeneration', () => {
    const d = describePlan(p.sessions, { raceDate: portoIn.raceDate, racePaceS: portoIn.racePaceS })
    expect(d.weekdays).toEqual({ 1: 'easy', 2: 'tempo', 3: 'easy', 4: 'easy', 5: 'rest', 6: 'long', 7: 'recovery' })
  })
  it('Läufe pro Woche, Schlüsseleinheiten und Longrun-Anteil passen zur Vorlage; längster Lauf gemeldet', () => {
    const d = describePlan(p.sessions, { raceDate: portoIn.raceDate, racePaceS: portoIn.racePaceS })
    const rows = compareToTemplate(portoIn.template, d, 'marathon')
    expect(rows.filter((r) => (r.key === 'week.runs' || r.key.startsWith('week.key_sessions.') || r.key === 'week.long_run.share') && !r.ok)).toEqual([])
    // The research rules (spike, +2 km steps, ≤ 3 runs ≥ 32 km) stay below Porto's 41 km; reported, not asserted.
    console.info('Porto längster Lauf:', rows.find((r) => r.key === 'week.long_run.max_km'))
  })
  it('jede Woche hat genau die km des Gerüsts (außer der Rennwoche)', () => {
    for (const w of p.weeks.slice(0, -1)) expect({ kw: w.kw, km: w.km }).toEqual({ kw: w.kw, km: portoSk.weeks.find((x) => x.start === w.start)!.km })
  })
  it('Renntag: Sonntag, 42,2 km, fest', () => {
    expect(p.sessions.find((s) => s.type === 'race')).toMatchObject({ date: '2026-11-08', km: 42.2, anchor: true, title: 'Porto-Marathon' })
  })
})

describe('HM 02/2027 (AC-4)', () => {
  const p = days(hmSk, hmIn)
  const L = longs(p)

  it('Longruns steigen ab 16 km um höchstens 2 km je Belastungswoche; der längste liegt ≥ 2 Wochen vor dem Rennen', () => {
    expect(L[0].km).toBeLessThanOrEqual(16)
    const max = Math.max(...L.map((s) => s.km ?? 0))
    const lastMax = L.filter((s) => s.km === max).pop()!
    expect(lastMax.date <= '2027-02-07').toBe(true)
    expect(max).toBeLessThanOrEqual(26)
  })
  it('Erholungswochen: Longrun höchstens 70 % der Woche davor', () => {
    hmSk.weeks.forEach((w, i) => {
      if (w.kind !== 'recovery') return
      const prev = L.find((s) => s.date >= hmSk.weeks[i - 1].start && s.date < w.start)!.km!
      const cur = L.find((s) => s.date >= w.start && s.date < hmSk.weeks[i + 1].start)!.km!
      expect(cur).toBeLessThanOrEqual(Math.floor(prev * 0.7 * 2) / 2)
    })
  })
  it('Rennwoche rückwärts: So Rennen · Sa Shakeout 3 km · Fr Ruhe · Do Qualität', () => {
    const wk = p.sessions.filter((s) => s.date >= '2027-02-15')
    expect(wk.map((s) => [weekday(s.date), s.type, s.km ?? 0, !!s.key])).toEqual(expect.arrayContaining([
      [7, 'race', 21.1, false], [6, 'easy', 3, false], [5, 'rest', 0, false], [4, 'tempo', 9, true],
    ]))
    expect(wk.some((s) => s.type === 'long')).toBe(false)
  })
  it('KW53 (28.12.–3.1.) hat 7 Tage, Neujahr ist ein normaler Tag', () => {
    const kw53 = p.sessions.filter((s) => s.date >= '2026-12-28' && s.date <= '2027-01-03')
    expect(kw53).toHaveLength(7)
    expect(p.weeks.find((w) => w.start === '2026-12-28')).toMatchObject({ kw: 53, end: '2027-01-03' })
  })
})

describe('Grenzfälle', () => {
  it('Rennen am Samstag: Rennen Sa, Qualität Mi, kein Longrun, Sonntag danach Ruhe', () => {
    const sk = skeleton({ template: template('pfitzinger-half'), distance: 'half', raceDate: '2027-02-20', start: '2026-11-30', currentKm: 50, provenKm: 101 })
    const p = days(sk, { ...hmIn, raceDate: '2027-02-20' })
    const wk = p.sessions.filter((s) => s.date >= '2027-02-15')
    expect(wk.find((s) => s.type === 'race')!.date).toBe('2027-02-20')
    expect(wk.find((s) => s.key)!.date).toBe('2027-02-17')
    expect(wk.find((s) => s.date === '2027-02-21')!.type).toBe('rest')
  })
  it('4 Tage, Tageslimit 12/25 km: gültiger Plan, Wochen über dem Limit werden gesenkt und gemeldet', () => {
    const profile: AthleteProfile = { ...RUNNER, availableDays: [2, 4, 6, 7], restDay: 1, qualityDays: [2], maxKmWeekday: 12, maxKmWeekend: 25 }
    const p = days(hmSk, { ...hmIn, profile })
    expect(p.warnings.join(' ')).toContain('Tageslimit begrenzt die Woche')
    expect(Math.max(...p.sessions.filter((s) => weekday(s.date) <= 5 && s.type !== 'race').map((s) => s.km ?? 0))).toBeLessThanOrEqual(12)
  })
  it('3 Tage Fr–So, Wochenende höchstens 12 km: kein Lauf länger als der Longrun, ein Hinweis für alle gesenkten Wochen', () => {
    const profile: AthleteProfile = { ...RUNNER, availableDays: [5, 6, 7], longRunDay: 7, restDay: 1, qualityDays: [5], maxKmWeekday: null, maxKmWeekend: 12 }
    const sk = skeleton({ template: template('pfitzinger-half'), distance: 'half', raceDate: '2027-02-21', start: '2026-11-30', currentKm: 60, provenKm: 60 })
    const p = days(sk, { ...hmIn, profile, longest30Km: 12 })
    expect(Math.max(...p.sessions.filter((s) => s.type !== 'race').map((s) => s.km ?? 0))).toBeLessThanOrEqual(12)
    const hint = p.warnings.filter((x) => x.startsWith('Kein Lauf ist länger als der Longrun'))
    expect(hint).toHaveLength(1)
    expect(hint[0]).toMatch(/\d+ Wochen bleiben deshalb unter dem Ziel \(am stärksten KW \d+: [\d,]+ statt [\d,]+ km\)\. Mehr Lauftage oder ein höheres Tageslimit am Longrun-Tag heben sie an\./)
    expect(p.warnings.filter((x) => /^KW \d+: /.test(x) && !x.includes('Rennwoche'))).toEqual([])
  })
  it('Beispielprofil mit 6 Tagen: kein Hinweis, nur die Rennwoche liegt unter dem Gerüst', () => {
    const p = days(hmSk, hmIn)
    expect(p.warnings.join(' ')).not.toContain('Kein Lauf ist länger')
    expect(p.weeks.slice(0, -1).map((w) => w.km)).toEqual(hmSk.weeks.slice(0, -1).map((w) => w.km))
  })
  it('Einsteiger: höchstens 4 Läufe pro Woche', () => {
    const p = days(hmSk, { ...hmIn, profile: { ...RUNNER, experience: 'novice' } })
    for (const w of p.weeks.slice(0, -1)) {
      const runs = p.sessions.filter((s) => s.date >= w.start && s.date <= w.end && (s.km ?? 0) > 0 && s.type !== 'rest').length
      expect(runs).toBeLessThanOrEqual(4)
    }
  })
  it('Abstand der Schlüsseleinheiten: key_gap_days 1 und 2 halten', () => {
    for (const gap of [1, 2]) {
      const t = { ...template('daniels-half'), week: { ...template('daniels-half').week, key_gap_days: gap } }
      const sk = skeleton({ template: t, distance: 'half', raceDate: '2027-02-21', start: '2026-11-30', currentKm: 50, provenKm: 101 })
      days(sk, { ...hmIn, template: t })
    }
  })
  it('zu wenige Lauftage → deutscher Fehler', () => {
    expect(buildDays(hmSk, { ...hmIn, profile: { ...RUNNER, availableDays: [6], restDay: 5 } }))
      .toEqual({ ok: false, error: 'Zu wenige Lauftage: mindestens 2 pro Woche (Longrun und ein lockerer Lauf).' })
  })
  it('ohne Profil: Porto-ähnliche Vorgabe mit Hinweis', () => {
    const p = days(hmSk, { ...hmIn, profile: null })
    expect(p.warnings.join(' ')).toContain('Kein Trainingsprofil')
  })
})

describe('Longrun-Regeln (long-run.md)', () => {
  it('Spike-Regel: erster Longrun ≤ 30-Tage-Längster, jeder höchstens +10 %', () => {
    const p = days(hmSk, { ...hmIn, longest30Km: 10 })
    expect(longs(p)[0].km).toBeLessThanOrEqual(10)
  })
  it('Minutengrenze beim Longrun-Tempo (Daniels Marathon 150 min)', () => {
    const t = template('daniels-marathon')
    const sk = skeleton({ template: t, distance: 'marathon', raceDate: '2027-04-25', start: '2026-11-30', currentKm: 70, provenKm: 110 })
    const p = days(sk, { template: t, distance: 'marathon', raceDate: '2027-04-25', racePaceS: 263, profile: RUNNER, longest30Km: 30, longest12mKm: 42.2 })
    const pace = 263 + (t.paces.offsets.long ?? 0)
    expect(Math.max(...longs(p).map((s) => s.km ?? 0))).toBeLessThanOrEqual(150 * 60 / pace + 0.25)
  })
  it('Marathon: ohne 35-km-Lauf in 12 Monaten kein Longrun ≥ 35 km; höchstens 3 Longruns ≥ 32 km', () => {
    for (const longest12mKm of [30, 42.2]) {
      const p = days(portoSk, { ...portoIn, longest12mKm })
      const L = longs(p).map((s) => s.km ?? 0)
      if (longest12mKm < 35) expect(Math.max(...L)).toBeLessThan(35)
      expect(L.filter((k) => k >= 32).length).toBeLessThanOrEqual(3)
    }
  })
  it('Taper-Longruns ≤ 0,75 / 0,55 × letzter Spitzen-Longrun, keiner in der Rennwoche', () => {
    const p = days(portoSk, portoIn)
    const lastPeak = longs(p).filter((s) => s.date < '2026-10-19').pop()!.km!
    const taper = longs(p).filter((s) => s.date >= '2026-10-19')
    expect(taper.map((s) => s.km)).toEqual([Math.floor(lastPeak * 0.75 * 2) / 2, Math.floor(lastPeak * 0.55 * 2) / 2])
    expect(taper.every((s) => s.date < '2026-11-02')).toBe(true)
  })
})

describe('checkDays erkennt Fehler', () => {
  const p = days(portoSk, portoIn)
  const broken = (f: (s: DaysPlan['sessions']) => void) => { const c = structuredClone(p); f(c.sessions); return checkDays(c, portoSk, portoIn) }
  it('Longrun am Sonntag, zu langer Longrun, Lauf am Ruhetag, Qualität am Tag nach dem Longrun', () => {
    const sat = p.sessions.findIndex((s) => s.type === 'long' && s.date > '2026-08-01')
    expect(broken((s) => { s[sat] = { ...s[sat], km: 45 } }).join(' ')).toContain('Longrun 45 km')
    expect(broken((s) => { s[sat - 1] = { ...s[sat - 1], type: 'easy', km: 8 } }).join(' ')).toContain('nicht verfügbaren Tag')
    expect(broken((s) => { s[sat + 1] = { ...s[sat + 1], type: 'tempo', key: true } }).join(' ')).toContain('Tag nach dem Longrun')
    expect(broken((s) => { s.splice(10, 1) }).join(' ')).toContain('Lücke')
  })
})
