// Fortschritt im Block (07-27): pure progress numbers per training block.
import { describe, expect, it } from 'vitest'
import { addDays, format, parseISO } from 'date-fns'
import { blockProgress, phasesOf, z2Splits, type ProgressRun } from '@/lib/analytics/progress'
import type { PlanSession, PlanWeek, TrainingBlock } from '@/lib/plan/types'
import { hrMax, raceHr } from '@/lib/analytics/hr'

// HR values below are written for HFmax 200 and scaled to the configured HR model (lib/analytics/hr.ts).
const h = (bpm200: number) => Math.round((bpm200 * hrMax()) / 200)
const CAP = raceHr(21.0975).cap

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')

// A three-week HM block across the year boundary: KW 52 → KW 53 → KW 1, race on the last Sunday.
const WEEKS: PlanWeek[] = [
  { kw: 52, start: '2026-12-21', end: '2026-12-27', km: 50, focus: 'Aufbau' },
  { kw: 53, start: '2026-12-28', end: '2027-01-03', km: 40, focus: 'Spitze · Erholungswoche', cutback: true },
  { kw: 1, start: '2027-01-04', end: '2027-01-10', km: 30, focus: 'Taper · Rennwoche', taper: true },
]
const RACE = { name: 'Test-HM', shortName: 'HM', code: 'HM', date: '2027-01-10', distanceKm: 21.1, goalS: 5100, goalPaceS: 242, fallbackS: 5250, fallbackPaceS: 249 }

function sessionsOf(weeks: PlanWeek[], raceDate = RACE.date): PlanSession[] {
  const out: PlanSession[] = []
  for (const w of weeks) {
    out.push({ date: day(w.start, 0), type: 'easy', km: 8, title: 'Locker' })
    out.push({ date: day(w.start, 1), type: 'tempo', km: 12, title: 'Tempo', notes: '3 × 3 km @ 4:02', pace: '4:02', key: true })
    out.push({ date: day(w.start, 2), type: 'easy', km: 8, title: 'Locker' })
    out.push({ date: day(w.start, 3), type: 'intervals', km: 10, title: 'Intervalle', notes: '5 × 1 km @ 3:45', pace: '3:45' })
    out.push({ date: day(w.start, 4), type: 'rest', title: 'Ruhe' })
    out.push({ date: day(w.start, 5), type: 'long', km: 20, title: 'Longrun' })
    out.push({ date: day(w.start, 6), type: 'recovery', km: 5, title: 'Regeneration' })
  }
  const race = out.find((s) => s.date === raceDate)
  if (race) Object.assign(race, { type: 'race', km: 21.1, title: 'Test-HM', pace: '4:02', notes: undefined })
  return out
}

const BLOCK: TrainingBlock = { id: 'test-hm', goalId: 'g', race: RACE, planStart: '2026-12-21', end: '2027-01-10', weeks: WEEKS, sessions: sessionsOf(WEEKS), rules: [], stopRules: [], levers: [] }
const SESSIONS = BLOCK.sessions

let n = 0
function run(date: string, km: number, paceS: number, hr: number | null, opts: { type?: ProgressRun['type']; gainM?: number; splitPaces?: number[] } = {}): ProgressRun {
  const full = Math.floor(km)
  hr = hr == null ? null : h(hr)
  return {
    id: `r${++n}`, date, km, paceS, avgHr: hr, type: opts.type ?? 'Locker',
    splits: Array.from({ length: full }, (_, i) => ({ km: i + 1, distM: 1000, paceS: opts.splitPaces?.[i] ?? paceS, hr, gainM: opts.gainM ?? 0 })),
  }
}

describe('blockProgress: Wochen und Grenzen', () => {
  it('leer: keine Läufe, Block noch nicht begonnen → neutrale Hinweise, kein Fehler', () => {
    const p = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [], today: '2026-12-01' })
    expect(p.weeks).toHaveLength(3)
    expect(p.weeks.every((w) => w.actualKm == null && w.cumActualKm == null && !w.started)).toBe(true)
    expect(p.weeks.map((w) => w.cumPlanKm)).toEqual([50, 90, 120])
    expect(p.volume.tone).toBe('neutral')
    expect(p.volume.text).toContain('beginnt am 21.12.')
    expect(p.z2.tone).toBe('neutral')
    expect(p.long.text).toBe('Erster Longrun: 20 km am 26.12.')
    expect(p.quality.points).toHaveLength(0)
    expect(p.quality.text).toBe('Noch kein Renntempo-Block gelaufen.')
  })

  it('Wochen-Keys bleiben über den Jahreswechsel eindeutig (KW 53 → KW 1), Phasen und Rennwoche stimmen', () => {
    const p = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [], today: '2027-02-01' })
    expect(new Set(p.weeks.map((w) => w.key)).size).toBe(3)
    expect(p.weeks.map((w) => w.label)).toEqual(['KW 52', 'KW 53', 'KW 1'])
    expect(p.weeks.map((w) => w.phase)).toEqual(['Aufbau', 'Spitze', 'Taper'])
    expect(p.weeks.map((w) => w.easy)).toEqual([false, true, false])
    expect(p.phases).toEqual([{ label: 'Aufbau', from: 0, to: 0 }, { label: 'Spitze', from: 1, to: 1 }, { label: 'Taper', from: 2, to: 2 }])
    expect(p.raceWeek).toBe(2)
  })

  it('Läufe vor und nach dem Block zählen nicht; Wochen nach heute haben kein Ist', () => {
    const runs = [run('2026-12-20', 30, 330, 135), run('2026-12-22', 10, 330, 135), run('2027-01-11', 30, 330, 135)]
    const p = blockProgress({ block: BLOCK, sessions: SESSIONS, runs, today: '2026-12-23' })
    expect(p.weeks[0].actualKm).toBe(10)
    expect(p.weeks[0].started).toBe(true)
    expect(p.weeks[0].current).toBe(true)
    expect(p.weeks[1].actualKm).toBeNull()
    expect(p.weeks[2].actualKm).toBeNull()
    expect(p.volume.actualToDateKm).toBe(10)
    expect(p.volume.planToDateKm).toBe(8 + 12)        // Mo, Di geplant; heute (Mi) zählt erst, wenn gelaufen
    const ran = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [...runs, run('2026-12-23', 8, 330, 135)], today: '2026-12-23' })
    expect(ran.volume.planToDateKm).toBe(8 + 12 + 8)
    expect(p.volume.weeksStarted).toBe(1)
    expect(p.long.longestKm).toBe(10)
  })

  it('heute nach dem Block: alle Wochen haben Ist, Renntag-km zählen nicht zum Umfang', () => {
    const runs = WEEKS.flatMap((w) => [run(day(w.start, 0), 8, 330, 135), run(day(w.start, 5), 20, 320, 140)])
    runs.push(run(RACE.date, 21.1, 242, 180, { type: 'Rennen' }))
    const p = blockProgress({ block: BLOCK, sessions: SESSIONS, runs, today: '2027-03-01' })
    expect(p.weeks.every((w) => w.actualKm != null && w.started && !w.current)).toBe(true)
    expect(p.weeks[2].actualKm).toBe(28)                       // 8 + 20, the race is not weekly volume
    expect(p.weeks[2].longActualKm).toBe(21.1)                 // but it is the longest run of the week
    expect(p.weeks.map((w) => w.cumActualKm)).toEqual([28, 56, 84])
    expect(p.volume.weeksStarted).toBe(3)
  })

  it('Ein-Wochen-Block', () => {
    const block: TrainingBlock = { ...BLOCK, weeks: [WEEKS[0]], sessions: sessionsOf([WEEKS[0]], '2026-12-27'), end: '2026-12-27', race: { ...RACE, date: '2026-12-27' } }
    const p = blockProgress({ block, sessions: block.sessions, runs: [run('2026-12-22', 12, 300, 150)], today: '2026-12-24' })
    expect(p.weeks).toHaveLength(1)
    expect(p.phases).toEqual([{ label: 'Aufbau', from: 0, to: 0 }])
    expect(p.raceWeek).toBe(0)
    expect(p.volume.actualToDateKm).toBe(12)
  })
})

describe('blockProgress: Umfang-Hinweis', () => {
  const plan = 50   // week 1 on its Sunday: sessions (63 km) capped at the week target
  const at = (km: number) => blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [run('2026-12-21', km, 330, 135)], today: '2026-12-27' })
  it('≥ 95 % im Soll, 85–95 leicht darunter, < 85 deutlich darunter, ≥ 110 zu viel', () => {
    expect(at(plan * 0.97).volume.tone).toBe('good')
    expect(at(plan * 0.97).volume.text).toMatch(/^Nach 1 von 3 Wochen: .* geplanten km \(97 %\) – im Soll\.$/)
    expect(at(plan * 0.9).volume.tone).toBe('warn')
    expect(at(plan * 0.9).volume.text).toContain('leicht unter Plan')
    expect(at(plan * 0.7).volume.tone).toBe('bad')
    expect(at(plan * 1.15).volume.tone).toBe('warn')
    expect(at(plan * 1.15).volume.text).toContain('mehr als geplant')
  })
})

describe('blockProgress: Tempo in Zone 2', () => {
  it('zählt nur saubere km: ab km 2, flach, Puls in Z2, kein Laufband, kein Rennen', () => {
    const base = run('2026-12-21', 10, 330, 136)
    expect(z2Splits(base)).toHaveLength(9)                                              // km 1 excluded
    expect(z2Splits({ ...base, type: 'Laufband' })).toHaveLength(0)
    expect(z2Splits({ ...base, type: 'Rennen' })).toHaveLength(0)
    expect(z2Splits(run('2026-12-21', 10, 330, 136, { gainM: 25 }))).toHaveLength(0)
    expect(z2Splits(run('2026-12-21', 10, 330, 150))).toHaveLength(0)                   // Z3
    expect(z2Splits(run('2026-12-21', 10, 330, 129))).toHaveLength(0)                   // Z1
    expect(z2Splits(run('2026-12-21', 10, 330, null))).toHaveLength(0)
    expect(z2Splits({ ...base, splits: base.splits.map((s) => ({ ...s, distM: 900 })) })).toHaveLength(0)
  })

  it('eine Woche braucht mindestens 4 saubere km für einen Punkt; Median der km-Tempi', () => {
    const p = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [run('2026-12-21', 4, 330, 136)], today: '2026-12-27' })
    expect(p.weeks[0].z2Km).toBe(3)
    expect(p.weeks[0].z2PaceS).toBeNull()
    const q = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [run('2026-12-21', 6, 330, 136, { splitPaces: [400, 340, 320, 330, 350, 310] })], today: '2026-12-27' })
    expect(q.weeks[0].z2Km).toBe(5)
    expect(q.weeks[0].z2PaceS).toBe(330)   // median of 340 320 330 350 310
  })

  it('Trend: schneller = aerob fitter, langsamer = Warnung, ±5 s stabil; mit < 2 Punkten kein Trend', () => {
    const weekly = (paces: number[]) => WEEKS.slice(0, paces.length).map((w, i) => run(day(w.start, 0), 8, paces[i], 136))
    const fitter = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: weekly([340, 325]), today: '2027-01-03' })
    expect(fitter.z2).toMatchObject({ tone: 'good', firstPaceS: 340, lastPaceS: 325, deltaS: -15 })
    expect(fitter.z2.text).toBe('Tempo in Zone 2 von 5:40 auf 5:25/km (−15 s/km): aerob fitter.')
    const slower = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: weekly([325, 340]), today: '2027-01-03' })
    expect(slower.z2.tone).toBe('warn')
    expect(slower.z2.text).toContain('+15 s/km')
    const flat = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: weekly([330, 333]), today: '2027-01-03' })
    expect(flat.z2.tone).toBe('neutral')
    expect(flat.z2.text).toContain('stabil bei etwa 5:33/km')
    const one = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: weekly([330]), today: '2027-01-03' })
    expect(one.z2.deltaS).toBeNull()
    expect(one.z2.tone).toBe('neutral')
  })
})

describe('blockProgress: Longrun-Aufbau', () => {
  it('geplanter Longrun je Woche vs. längster Lauf; gelaufen ab 90 % der Plan-km', () => {
    const runs = [run('2026-12-26', 18.5, 330, 140), run('2027-01-02', 15, 330, 140)]
    const p = blockProgress({ block: BLOCK, sessions: SESSIONS, runs, today: '2027-01-03' })
    expect(p.weeks.map((w) => w.longPlanKm)).toEqual([20, 20, 20])
    expect(p.weeks.map((w) => w.longActualKm)).toEqual([18.5, 15, null])
    expect(p.long).toMatchObject({ planned: 2, done: 1, longestKm: 18.5, longestDate: '2026-12-26', tone: 'warn' })
    expect(p.long.text).toBe('Längster Lauf: 18,5 km (26.12.) · Longruns gelaufen: 1 von 2 – Lücken im Aufbau.')
  })
  it('alle gelaufen = der Aufbau steht; keiner = fehlt zu oft; Longrun-Tag noch nicht erreicht = nicht geplant', () => {
    const all = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [run('2026-12-26', 20, 330, 140), run('2027-01-02', 19, 330, 140)], today: '2027-01-03' })
    expect(all.long).toMatchObject({ planned: 2, done: 2, tone: 'good' })
    const none = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [run('2026-12-26', 8, 330, 140), run('2027-01-02', 8, 330, 140)], today: '2027-01-03' })
    expect(none.long).toMatchObject({ planned: 2, done: 0, tone: 'bad' })
    const early = blockProgress({ block: BLOCK, sessions: SESSIONS, runs: [run('2026-12-21', 8, 330, 140)], today: '2026-12-24' })
    expect(early.long.planned).toBe(0)
    expect(early.long.text).toBe('Längster Lauf im Block: 8 km (21.12.).')
  })
})

describe('blockProgress: Renntempo-Blöcke', () => {
  // Tuesday tempo: 3 × 3 km @ 4:02 — the run's 9 fastest full km decide.
  const tempo = (date: string, blockPace: number, hr: number): ProgressRun => {
    const r = run(date, 12, 300, 150, { splitPaces: [330, 330, ...Array(9).fill(blockPace), 330], type: 'Tempo' })
    return { ...r, splits: r.splits.map((s, i) => ({ ...s, hr: i >= 2 && i < 11 ? h(hr) : h(140) })) }
  }

  it('jede Tempo-Einheit wird ein Punkt: Δ zum Ziel, Urteil, HF des Blocks, Renntempo vs. schneller, versucht', () => {
    const runs = [tempo('2026-12-22', 243, 176), tempo('2026-12-29', 260, 180), tempo('2027-01-05', 290, 150)]
    const p = blockProgress({ block: BLOCK, sessions: SESSIONS, runs, today: '2027-01-09' })
    const pts = p.quality.points
    expect(pts).toHaveLength(6)                                            // 3 tempo + 3 interval sessions ≤ today
    const t1 = pts.find((q) => q.date === '2026-12-22')!
    expect(t1).toMatchObject({ ranOn: '2026-12-22', targetS: 242, actualS: 243, deltaS: 1, hr: h(176), verdict: 'im Ziel', racePace: true, attempted: true, km: 9 })
    expect(pts.find((q) => q.date === '2026-12-29')).toMatchObject({ deltaS: 18, verdict: 'zu langsam', attempted: true })
    expect(pts.find((q) => q.date === '2027-01-05')).toMatchObject({ deltaS: 48, verdict: 'zu langsam', attempted: false })
    const iv = pts.find((q) => q.date === '2026-12-24')!
    expect(iv).toMatchObject({ verdict: 'kein Lauf', racePace: false, attempted: false, actualS: null, ranOn: null })
  })

  it('Hinweis aus den letzten versuchten Renntempo-Blöcken: Treffer und HF gegen die Rennen-HF', () => {
    const at = (blocks: [string, number, number][]) => blockProgress({ block: BLOCK, sessions: SESSIONS, runs: blocks.map((b) => tempo(...b)), today: '2027-01-09' }).quality
    expect(at([['2026-12-22', 243, 174], ['2026-12-29', 240, 176]])).toMatchObject({ tone: 'good', text: `Renntempo: 2 von 2 letzten Blöcken im Ziel, HF Ø ${h(175)} unter ${CAP} – sitzt.` })
    expect(at([['2026-12-22', 243, 181], ['2026-12-29', 240, 181]])).toMatchObject({ tone: 'warn' })
    expect(at([['2026-12-22', 243, 181], ['2026-12-29', 240, 181]]).text).toContain(`HF Ø ${h(181)} über ${CAP} – Tempo da, aber teuer.`)
    expect(at([['2026-12-22', 243, 185], ['2026-12-29', 240, 185]]).text).toContain(`deutlich über ${CAP}`)
    expect(at([['2026-12-22', 260, 170], ['2026-12-29', 262, 170], ['2027-01-05', 243, 170]])).toMatchObject({ tone: 'warn' })
    expect(at([['2026-12-22', 260, 170], ['2026-12-29', 262, 170], ['2027-01-05', 243, 170]]).text).toContain('1 von 3 letzten Blöcken im Ziel')
    expect(at([['2026-12-22', 260, 170], ['2026-12-29', 243, 170]])).toMatchObject({ tone: 'neutral' })   // 1 of 2: wird stabiler
    expect(at([['2026-12-22', 243, 170]]).text).toBe(`Renntempo: 1 von 1 Block im Ziel, HF Ø ${h(170)} unter ${CAP} – sitzt.`)
    expect(at([['2026-12-22', 290, 170]]).text).toBe('Noch kein Renntempo-Block gelaufen.')   // not attempted
  })
})

describe('phasesOf', () => {
  it('fasst gleiche Phasen zu Bereichen zusammen', () => {
    expect(phasesOf(['a', 'a', 'b', 'a'].map((phase) => ({ phase })))).toEqual([{ label: 'a', from: 0, to: 1 }, { label: 'b', from: 2, to: 2 }, { label: 'a', from: 3, to: 3 }])
    expect(phasesOf([])).toEqual([])
  })
})
