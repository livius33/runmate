// Kettlebell days: markers on the profile's weekdays by fixed rules in generated and base blocks, never in a hand-written
// block, none without a profile; done from Strength/Gym rows; markers carry no km and move with their session.
import { describe, expect, it } from 'vitest'
import { addDays, format, getISODay, parseISO } from 'date-fns'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { EXAMPLE_GOALS } from '@/examples/porto-2026/season'
import { generateDraft, type Draft, type DraftChoice } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import { baseBlocks, type BaseRun } from '@/lib/plan/base-block'
import { PORTO_2026 } from '@/examples/porto-2026/plan'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import type { PlanSession, PlanWeek, TrainingBlock } from '@/lib/plan/types'
import {
  KB, isKeyDay, kbDaysOf, kbWeek, placeStrength, strengthDetail, strengthDone, strengthMark, strengthToday, strengthWeek, syncedThroughOf,
} from '@/lib/plan/strength'

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const wd = (d: string) => getISODay(parseISO(d))
const template = (id: string) => listMethodologies().valid.find((m) => m.id === id)!.params
const RUNNER: AthleteProfile = {
  v: 1, age: 40, weightKg: 70, heightCm: null, experience: 'advanced', weeklyKm: 64,
  availableDays: [1, 2, 3, 4, 6, 7], longRunDay: 6, qualityDays: [2, 4], kbDays: [2, 4, 6], restDay: 5,
  maxKmWeekday: null, maxKmWeekend: null, fitnessMethod: 'threshold', thresholdPaceS: null, fiveKS: null, savedAt: null,
}
const hm = EXAMPLE_GOALS.find((g) => g.id === 'hm-2027')!
const choice: DraftChoice = {
  goal: hm, template: template('pfitzinger-half'), start: '2026-11-30', profile: RUNNER,
  measured: { currentKm: 50, currentKmSource: 'recoveryBlock', provenKm: 101, longest30Km: 16, longest12mKm: 42.2, recentRace: null },
}

// A hand-made block: one week from Monday, sessions per weekday (1 = Mo), the race far away.
const run = (date: string, extra: Partial<PlanSession> = {}): PlanSession => ({ date, type: 'easy', km: 10, title: 'Locker', ...extra })
function block(weeks: { start: string; flags?: Partial<PlanWeek>; days?: Record<number, Partial<PlanSession>> }[], raceDate = '2027-06-01'): TrainingBlock {
  const sessions: PlanSession[] = []
  for (const w of weeks) for (let d = 1; d <= 7; d++) {
    const date = day(w.start, d - 1)
    sessions.push(d === 5 ? { date, type: 'rest', title: 'Ruhetag' } : run(date, w.days?.[d]))
  }
  return {
    ...PORTO_2026, handWritten: undefined, id: 'gen-test', goalId: 'g', race: { ...PORTO_2026.race, date: raceDate }, planStart: weeks[0].start, end: day(weeks[weeks.length - 1].start, 6),
    weeks: weeks.map((w, i) => ({ kw: 50 + i, start: w.start, end: day(w.start, 6), km: 60, focus: '', ...w.flags })), sessions,
  }
}
const KB_DAYS = kbDaysOf(RUNNER)                 // Tue + Thu, Sat optional
const marks = (b: TrainingBlock) => b.sessions.filter((s) => s.strength).map((s) => [s.date, !!s.strength!.optional])

describe('Platzierung (AC-1)', () => {
  const MON = '2026-12-07'
  it('normale Woche: Di + Do 30–40 Min., Sa optional 20–30 Min.; kein Ruhetag', () => {
    const b = placeStrength(block([{ start: MON }]), KB_DAYS)
    expect(marks(b)).toEqual([[day(MON, 1), false], [day(MON, 3), false], [day(MON, 5), true]])
    expect(b.sessions.find((s) => s.date === day(MON, 1))!.strength).toEqual({ minMin: 30, maxMin: 40 })
    expect(b.sessions.find((s) => s.date === day(MON, 5))!.strength).toEqual({ minMin: 20, maxMin: 30, optional: true })
    // a rest day never gets one, even when chosen
    expect(marks(placeStrength(block([{ start: MON }]), [5]))).toEqual([])
  })
  it('nicht an den 2 Tagen vor einem Schlüssel-Longrun, Test oder Rennen', () => {
    const keyLong = placeStrength(block([{ start: MON, days: { 6: { type: 'long', km: 30, key: true } } }]), KB_DAYS)
    expect(marks(keyLong).map(([d]) => d)).toEqual([day(MON, 1)])                  // Thu (−2) out; Sat itself is the key day
    const test = placeStrength(block([{ start: MON, days: { 6: { type: 'long', km: 24, test: 'Generalprobe' } } }]), KB_DAYS)
    expect(marks(test).map(([d]) => d)).toEqual([day(MON, 1)])
    const race = placeStrength(block([{ start: MON, days: { 4: { type: 'race', km: 10, anchor: true } } }]), KB_DAYS)
    expect(marks(race).map(([d]) => d)).toEqual([day(MON, 5)])                     // Tue = 2 days before, Thu = race day
    // a plain long run is no key day: Thu stays
    expect(marks(placeStrength(block([{ start: MON, days: { 6: { type: 'long', km: 20 } } }]), KB_DAYS)).length).toBe(3)
  })
  it('Rennwoche keine, leichtere Wochen nur Di, erste Erholungswoche keine, spätere ohne Sa', () => {
    const b = placeStrength(block([
      { start: MON, flags: { cutback: true } },
      { start: day(MON, 7), flags: { taper: true } },
      { start: day(MON, 14), flags: { light: true } },
      { start: day(MON, 21), flags: { taper: true }, days: { 7: { type: 'race', km: 21.1, anchor: true } } },
      { start: day(MON, 28), flags: { recovery: true } },
      { start: day(MON, 35), flags: { recovery: true } },
    ], day(MON, 27)), KB_DAYS)
    expect(marks(b).map(([d]) => d)).toEqual([day(MON, 1), day(MON, 8), day(MON, 15), day(MON, 36), day(MON, 38)])
  })
  it('Profil: gewählte Tage (leer = keine); ohne Profil keine', () => {
    expect(KB_DAYS).toEqual([2, 4, 6])
    expect(kbDaysOf(null)).toEqual([])
    expect(kbDaysOf({ ...RUNNER, kbDays: [4, 1] })).toEqual([1, 4])
    expect(kbDaysOf({ ...RUNNER, kbDays: [] })).toEqual([])
    expect(marks(placeStrength(block([{ start: MON }]), []))).toEqual([])
  })
  it('idempotent, km/key/Typ unverändert', () => {
    const raw = block([{ start: MON, days: { 2: { type: 'tempo', key: true, pace: '4:00' } } }])
    const once = placeStrength(raw, KB_DAYS)
    expect(placeStrength(once, KB_DAYS)).toEqual(once)
    expect(once.sessions.map(({ strength: _s, ...s }) => s)).toEqual(raw.sessions)
    expect(once.sessions.find((s) => s.date === day(MON, 1))!.strength).toBeTruthy()  // after the quality run
  })
  it('handgeschriebener Block bleibt wie geschrieben: keine Marker', () => {
    expect(placeStrength(PORTO_2026, KB_DAYS)).toBe(PORTO_2026)
    expect(PORTO_2026.sessions.some((s) => s.strength)).toBe(false)
    expect(marks(placeStrength({ ...block([{ start: MON }]), handWritten: true }, KB_DAYS))).toEqual([])
  })
  it('isKeyDay: Rennen, Anker, Test, Longrun mit Tempo oder key', () => {
    expect([{ type: 'race' }, { type: 'easy', anchor: true }, { type: 'long', test: 'x' }, { type: 'long', pace: '4:23' }, { type: 'long', key: true }, { type: 'long' }, { type: 'tempo', key: true }]
      .map((s) => isKeyDay({ date: MON, title: '', ...s } as PlanSession))).toEqual([true, true, true, true, true, false, false])
  })
  it('kbWeek: Basisblock hat keine Rennwoche', () => {
    const b = { ...block([{ start: MON }], day(MON, 3)), base: true }
    expect(kbWeek(b.weeks[0], b)).toBe('all')
  })
})

describe('Grundlagenblock nach dem Beispielblock (AC-1)', () => {
  const runs: BaseRun[] = []
  for (let d = '2026-06-01'; d <= '2026-11-29'; d = day(d, 1)) if (wd(d) !== 5) runs.push({ date: d, km: 9 })
  const [b] = baseBlocks({ blocks: [PORTO_2026], runs, today: '2026-11-30', profile: RUNNER })
  it('beginnt KW49 mit Di 1.12.: Di/Do in Ladewochen, Sa optional, Entlastungswoche nur Di', () => {
    expect(b.planStart).toBe('2026-11-30')
    const first = b.sessions.filter((s) => s.date <= '2026-12-06' && s.strength).map((s) => s.date)
    expect(first[0]).toBe('2026-12-01')
    expect(first).toContain('2026-12-03')
    for (const w of b.weeks) {
      const m = b.sessions.filter((s) => s.date >= w.start && s.date <= w.end && s.strength)
      if (w.cutback) expect(m.map((s) => wd(s.date))).toEqual([2])
      for (const s of m) expect(s.type).not.toBe('rest')
    }
  })
  it('ohne Profil keine Marker', () => {
    const [plain] = baseBlocks({ blocks: [PORTO_2026], runs, today: '2026-11-30', profile: null })
    expect(plain.sessions.some((s) => s.strength)).toBe(false)
  })
  it('Wochen-km wie ohne Marker', () => {
    for (const w of b.weeks) {
      const km = b.sessions.filter((s) => s.date >= w.start && s.date <= w.end && s.type !== 'rest').reduce((t, s) => t + (s.km ?? 0), 0)
      expect(Math.round(km * 10) / 10).toBe(w.km)
    }
  })
})

describe('Generierter HM-Block (AC-1)', () => {
  const d = generateDraft(choice) as Draft
  const all = [...d.workouts.sessions, ...d.recovery!.sessions]
  const weekOf = (date: string) => [...d.days.weeks, ...d.recovery!.weeks].find((w) => w.start <= date && date <= w.end)!
  it('Marker auf Di/Do (Sa optional), nie in der Rennwoche, nie 2 Tage vor Test/Rennen/Schlüssel-Longrun', () => {
    const marked = all.filter((s) => s.strength)
    expect(marked.length).toBeGreaterThan(10)
    expect(new Set(marked.map((s) => wd(s.date)))).toEqual(new Set([2, 4, 6]))
    const raceWeek = d.days.weeks[d.days.weeks.length - 1]
    expect(marked.filter((s) => s.date >= raceWeek.start && s.date <= raceWeek.end)).toEqual([])
    const byDate = new Map(all.map((s) => [s.date, s]))
    for (const s of marked) {
      expect(isKeyDay(byDate.get(day(s.date, 1)))).toBe(false)
      expect(isKeyDay(byDate.get(day(s.date, 2)))).toBe(false)
      expect(s.type).not.toBe('rest')
    }
  })
  it('Generalprobe: keine Marker in den 2 Tagen davor', () => {
    const gp = all.find((s) => s.test === 'Generalprobe')!
    expect(gp).toBeTruthy()
    expect(all.filter((s) => s.strength && s.date >= day(gp.date, -2) && s.date < gp.date)).toEqual([])
  })
  it('leichtere Wochen (Erholung, Taper) nur Di; erste Erholungswoche nach dem Rennen keine', () => {
    for (const w of d.days.weeks.slice(0, -1).filter((x) => x.cutback || x.taper)) {
      const m = all.filter((s) => s.strength && s.date >= w.start && s.date <= w.end)
      expect(m.every((s) => wd(s.date) === 2)).toBe(true)
    }
    const r1 = d.recovery!.weeks[0]
    expect(all.filter((s) => s.strength && s.date >= r1.start && s.date <= r1.end)).toEqual([])
    expect(weekOf(r1.start).recovery).toBe(true)
  })
  it('Profil ohne Kettlebell-Tage: keine Marker; km und Wochen gleich', () => {
    const none = generateDraft({ ...choice, profile: { ...RUNNER, kbDays: [] } }) as Draft
    expect([...none.workouts.sessions, ...none.recovery!.sessions].some((s) => s.strength)).toBe(false)
    expect(none.workouts.sessions.map((s) => s.km)).toEqual(d.workouts.sessions.map((s) => s.km))
    expect(none.days.weeks).toEqual(d.days.weeks)
  })
  it('live geschaltet: Marker bleiben, erneutes Platzieren ändert nichts', () => {
    const b = freezeDraft(d, hm, 'Pfitzinger', choice.template)
    expect(placeStrength(b, KB_DAYS).sessions).toEqual(b.sessions)
  })
})

describe('Erledigt-Prüfung (AC-3)', () => {
  const rows = [{ date: '2026-12-01', type: 'Strength' }, { date: '2026-12-03', type: 'Gym' }, { date: '2026-12-05', type: 'Ride' }, { date: '2026-12-06', type: 'Run' }]
  it('Kraft oder Gym am Tag zählt, Rad/Lauf nicht', () => {
    expect(['2026-12-01', '2026-12-03', '2026-12-05', '2026-12-06', '2026-12-02'].map((x) => strengthDone(x, rows))).toEqual([true, true, false, false, false])
  })
  it('Zustand: geplant · optional · erledigt · ausgelassen nur vergangen und synchronisiert', () => {
    const s = run('2026-12-01', { strength: KB.regular })
    expect(strengthMark(s, '2026-12-01', false, '2026-11-30')).toBe('planned')
    expect(strengthMark(s, '2026-12-03', true, '2026-12-02')).toBe('done')
    expect(strengthMark(s, '2026-12-03', false, '2026-12-02')).toBe('skipped')
    expect(strengthMark(s, '2026-12-03', false, '2026-11-30')).toBe('planned')        // not synced yet
    expect(strengthMark(s, '2026-12-03', false, null)).toBe('planned')
    expect(strengthMark(run('2026-12-01', { strength: KB.optional }), '2026-12-09', false, '2026-12-08')).toBe('optional')
    expect(strengthMark(run('2026-12-01'), '2026-12-01', true, null)).toBeNull()
  })
  it('Wochenzählung: optionale nur wenn erledigt', () => {
    const ss = [run('2026-12-01', { strength: KB.regular }), run('2026-12-03', { strength: KB.regular }), run('2026-12-05', { strength: KB.optional })]
    const dates = Array.from({ length: 7 }, (_, i) => day('2026-11-30', i))
    expect(strengthWeek(dates, ss, new Set(['2026-12-01']))).toEqual({ planned: 2, done: 1 })
    expect(strengthWeek(dates, ss, new Set(['2026-12-01', '2026-12-05']))).toEqual({ planned: 3, done: 2 })
    expect(strengthWeek(dates, [run('2026-12-01')], new Set())).toBeNull()
  })
  it('synchronisiert bis: Tag vor dem letzten erfolgreichen Sync', () => {
    const local = (d: Date) => format(d, 'yyyy-MM-dd')
    expect(syncedThroughOf({ at: '2026-12-03T08:00:00Z' }, local)).toBe('2026-12-02')
    expect(syncedThroughOf({ at: '2026-12-03T08:00:00Z', error: 'x' }, local)).toBeNull()
    expect(syncedThroughOf(null, local)).toBeNull()
    expect(syncedThroughOf({ at: 'kein Datum' }, local)).toBeNull()
  })
  it('Texte', () => {
    expect(strengthDetail(run('2026-12-01', { strength: KB.regular }))).toBe('Kettlebell nach dem Lauf: 30–40 Min., RPE 5–8')
    expect(strengthDetail(run('2026-12-05', { strength: KB.optional }))).toBe('Kettlebell nach dem Lauf: 20–30 Min., RPE 5–8, optional, wenn die Beine gut sind')
    expect(strengthToday(run('2026-12-01', { strength: KB.regular }), null)).toBe('Danach Kettlebell 30–40 Min. (RPE 5–8).')
    expect(strengthToday(run('2026-12-01', { strength: KB.regular }), 'TSB −32')).toBe('Kettlebell heute auslassen (TSB −32).')
  })
})
