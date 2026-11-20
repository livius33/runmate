// Generator step 3 (07-13): paces and workouts. Paces from the goal, threshold test or a recent race; Porto and HM
// workouts in the plan's notes format; the checker catches broken plans.
import { describe, expect, it } from 'vitest'
import { getISODay, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { describePlan } from '@/lib/plan/methodology/describe'
import { compareToTemplate } from '@/lib/plan/methodology/compare'
import { buildSkeleton, type Skeleton, type SkeletonInput } from '@/lib/plan/generator/skeleton'
import { buildDays, type DaysPlan } from '@/lib/plan/generator/days'
import { trainingPaces } from '@/lib/plan/generator/paces'
import { buildWorkouts, type WorkoutPlan, type WorkoutsInput } from '@/lib/plan/generator/workouts'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import { checkDays } from './days-check'
import { checkWorkouts } from './workouts-check'
import { portoTemplate } from '@/examples/porto-2026/template'

const template = (id: string) => listMethodologies().valid.find((m) => m.id === id)!.params
const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const ok = <T extends { ok: boolean }>(r: T | { ok: false; error: string }) => { if (!r.ok) throw new Error((r as { error: string }).error); return r as T }

function plan(sk: Skeleton, input: WorkoutsInput & { longest30Km: number; longest12mKm?: number }) {
  const days = ok(buildDays(sk, { ...input, racePaceS: trainingPaces(input).racePaceS })) as DaysPlan
  const w = ok(buildWorkouts(days, sk, input)) as WorkoutPlan
  expect(checkWorkouts(w, days, sk, input)).toEqual([])
  expect(checkDays({ ...days, sessions: w.sessions }, sk, { ...input, racePaceS: w.paces.racePaceS })).toEqual([])
  return { days, w }
}
const sk = (input: SkeletonInput) => ok(buildSkeleton(input)) as Skeleton

const portoSk = sk({ template: portoTemplate().params, distance: 'marathon', raceDate: '2026-11-08', start: '2026-06-22', currentKm: 64, provenKm: 64, peakKm: 126 })
const portoIn = { template: portoTemplate().params, distance: 'marathon' as const, raceDate: '2026-11-08', raceName: 'Porto-Marathon',
  goalS: 3 * 3600 + 5 * 60, profile: RUNNER, longest30Km: 21, longest12mKm: 42.2 }
const hmSk = sk({ template: template('pfitzinger-half'), distance: 'half', raceDate: '2027-02-21', start: '2026-11-30', currentKm: 50, provenKm: 101 })
const hmIn = { template: template('pfitzinger-half'), distance: 'half' as const, raceDate: '2027-02-21', goalS: 85 * 60, profile: RUNNER, longest30Km: 16 }

describe('Tempi (AC-1)', () => {
  it('aus der Zielzeit: Porto 4:23, HM 4:02; jedes Tempo = Renntempo + Versatz der Vorlage', () => {
    const porto = trainingPaces(portoIn)
    expect([porto.racePaceS, porto.fmt.marathon_pace, porto.fmt.threshold, porto.fmt.easy]).toEqual([263, '4:23', '4:15', '5:45'])
    const hm = trainingPaces(hmIn)
    expect([hm.racePaceS, hm.fmt.half_marathon_pace, hm.fmt.threshold, hm.fmt.intervals_vo2]).toEqual([242, '4:02', '3:57', '3:40'])
  })
  it('aus dem Schwellentest (Vorlage mit source threshold)', () => {
    const t = template('norwegian-threshold-half')
    const p = trainingPaces({ ...hmIn, template: t, profile: { ...RUNNER, thresholdPaceS: 248 } })
    expect(p.source).toBe('threshold')
    expect(p.racePaceS).toBe(248 - (t.paces.offsets.threshold ?? 0))
  })
  it('Riegel aus einem 10-km-Rennen; Ziel deutlich schneller → Warnungen', () => {
    const base = { ...hmIn, recentRace: { distanceKm: 10, timeS: 37 * 60, date: '2026-10-11' } }
    expect(trainingPaces(base).warnings).toEqual([])
    expect(trainingPaces({ ...base, recentRace: { ...base.recentRace, timeS: 40 * 60 } }).warnings.join(' ')).toContain('liegt 4 % über deiner aktuellen Form')
    expect(trainingPaces({ ...base, recentRace: { ...base.recentRace, timeS: 41.5 * 60 } }).warnings.join(' ')).toContain('Plan B prüfen')
  })
  it('ohne Wettkampf und Test: Hinweis auf einen Test in Woche 2–3', () => {
    expect(trainingPaces(hmIn).warnings.join(' ')).toContain('Test in Woche 2–3')
  })
  it('VDOT-Vorlage ohne Wettkampf: Tempi aus der Zielzeit mit Hinweis', () => {
    const p = trainingPaces({ ...hmIn, template: template('daniels-half') })
    expect(p.source).toBe('goal_time')
    expect(p.warnings.join(' ')).toContain('Kein Wettkampf aus den letzten 6 Monaten')
  })
})

describe('Porto-Einheiten (AC-2)', () => {
  const { w } = plan(portoSk, portoIn)
  const keys = w.sessions.filter((s) => s.key && s.type !== 'race')

  it('Grundlage: donnerstags Steigerungen, keine Schlüsseleinheiten', () => {
    const base = w.sessions.filter((s) => s.date < '2026-07-27')
    expect(base.filter((s) => s.key)).toEqual([])
    expect(base.filter((s) => getISODay(parseISO(s.date)) === 4).every((s) => s.notes?.includes('Steigerungen'))).toBe(true)
  })
  it('Aufbau: Dienstag aus der Aufbau-Liste der Vorlage, Samstag Longrun mit Marathontempo-Block (ab 10 Wochen vorher)', () => {
    const build = keys.filter((s) => s.date >= '2026-07-27' && s.date < '2026-09-21')
    expect(build.filter((s) => getISODay(parseISO(s.date)) === 2).every((s) => ['4:15', '4:01', '4:23', '3:55'].includes(s.pace!))).toBe(true)   // threshold, HM pace, progression at MP, VO2 (Porto build list)
    expect(build.some((s) => s.type === 'long' && s.pace === '4:23' && / locker → \d+(,\d)? km @ 4:23/.test(s.notes!))).toBe(true)
  })
  it('Generalprobe 20 km @ 4:23 vier Wochen vor der Rennwoche; Rennwoche 3 × 2 km @ 4:23', () => {
    const g = w.sessions.find((s) => s.test === 'Generalprobe')!
    expect(g.date >= '2026-10-05' && g.date <= '2026-10-11').toBe(true)
    expect(g.notes).toMatch(/20 km @ 4:23/)
    expect(w.sessions.find((s) => s.key && s.date >= '2026-11-02' && s.type !== 'race')!.notes).toMatch(/3 × 2 km @ 4:23/)
  })
  it('Intensität je Phase gemeldet (Vorlage vs. Plan)', () => {
    const d = describePlan(w.sessions, { raceDate: portoIn.raceDate, racePaceS: 263 })
    const rows = compareToTemplate(portoIn.template, d, 'marathon').filter((r) => r.key.startsWith('intensity.'))
    console.info('Porto Intensität:', rows.map((r) => `${r.key} ${r.template} → ${r.measured}${r.ok ? '' : ' ✗'}`).join(' · '))
  })
})

describe('HM 02/2027 (AC-4)', () => {
  const { w } = plan(hmSk, hmIn)
  const keys = w.sessions.filter((s) => s.key && s.type !== 'race')

  it('Schwelle, VO2max und HM-Tempo kommen vor; HM-Tempo erst 8 Wochen vor dem Rennen', () => {
    expect(keys.some((s) => s.pace === '3:57')).toBe(true)
    expect(keys.some((s) => s.pace === '3:40')).toBe(true)
    const hmPace = keys.filter((s) => s.pace === '4:02' && !s.test && s.date < '2027-02-15')
    expect(hmPace.length).toBeGreaterThan(0)
    expect(hmPace.every((s) => s.date >= '2026-12-21')).toBe(true)
  })
  it('Generalprobe drei Wochen vor der Rennwoche; Rennwoche 2 × 2 km @ 4:02', () => {
    const g = w.sessions.find((s) => s.test === 'Generalprobe')!
    expect(g.date >= '2027-01-25' && g.date <= '2027-01-31').toBe(true)
    expect(w.sessions.find((s) => s.key && s.date >= '2027-02-15' && s.type !== 'race')!.notes).toMatch(/2 × 2 km @ 4:02/)
  })
})

describe('checkWorkouts erkennt Fehler', () => {
  const { days, w } = plan(hmSk, hmIn)
  const broken = (f: (s: WorkoutPlan['sessions']) => void) => { const c = structuredClone(w); f(c.sessions); return checkWorkouts(c, days, hmSk, hmIn).join(' ') }
  const i = w.sessions.findIndex((s) => s.key && s.pace === '3:57')
  it('unlesbarer Aufbau, zu viel Qualität, harte Einheit kurz vor dem Rennen, geänderte km', () => {
    expect(broken((s) => { s[i] = { ...s[i], notes: 'irgendwas' } })).toContain('nicht lesbar')
    expect(broken((s) => { s[i] = { ...s[i], notes: `1 ein → ${(s[i].km ?? 0) - 2} km @ 3:57 → 1 aus` } })).toContain('Qualität')
    const late = w.sessions.findIndex((s) => s.date === '2027-02-17')
    expect(broken((s) => { s[late] = { ...s[i], date: s[late].date, type: s[late].type, km: s[late].km } })).toMatch(/Tag geändert|harte Einheit|Rennwoche/)
    expect(broken((s) => { s[i] = { ...s[i], km: (s[i].km ?? 0) + 1 } })).toContain('Tag geändert')
  })
})

describe('Renntempo im Longrun je Vorlage (07-04)', () => {
  const marathon = (id: string) => {
    const t = template(id)
    const s = sk({ template: t, distance: 'marathon', raceDate: '2027-04-25', start: '2026-11-30', currentKm: 70, provenKm: 110 })
    return plan(s, { template: t, distance: 'marathon', raceDate: '2027-04-25', goalS: 3 * 3600 + 5 * 60, profile: RUNNER, longest30Km: 30, longest12mKm: 42.2 }).w
  }
  it('Hansons und Lydiard: lange Läufe ohne Tempo-Block, Marathontempo bleibt unter der Woche', () => {
    for (const id of ['hansons-marathon', 'lydiard-marathon']) {
      const w = marathon(id)
      expect(w.sessions.filter((s) => s.type === 'long' && s.pace && !s.test)).toEqual([])
      expect(w.sessions.some((s) => s.type === 'tempo' && s.pace === '4:23')).toBe(true)
    }
  })
  it('Pfitzinger behält Tempo-Blöcke im Longrun', () => {
    expect(marathon('pfitzinger-marathon').sessions.some((s) => s.type === 'long' && s.pace === '4:23' && !s.test)).toBe(true)
  })
})

describe('Titel der Schlüsseleinheiten', () => {
  it('eine gefüllte Einheit heißt nach ihrem Inhalt, nicht „Qualität“', () => {
    const { w } = plan(hmSk, hmIn)
    const keys = w.sessions.filter((s) => s.key && (s.type === 'tempo' || s.type === 'easy'))
    expect(keys.length).toBeGreaterThan(10)
    expect(keys.filter((s) => s.title === 'Qualität')).toEqual([])
    // The medium-long run is the key by its length: an easy run without a pace, not a tempo day.
    expect(keys.find((s) => s.notes?.startsWith('Mittellanger Lauf'))).toMatchObject({ title: 'Mittellanger Lauf', type: 'easy', key: true })
    expect(keys.filter((s) => s.type === 'easy').every((s) => s.title === 'Mittellanger Lauf' && !s.pace)).toBe(true)
    expect(keys.find((s) => s.notes?.includes('VO2max'))?.title).toBe('Intervalle')
    expect(keys.find((s) => s.notes?.includes('Schwelle:'))?.title).toMatch(/Schwellenlauf|Tempolauf/)
  })
})
