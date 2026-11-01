// Measures any plan in the terms of a methodology template: weekly km curve, phases, recovery weeks, taper, intensity
// split, long runs, runs and key sessions per week. Used to check a template against a real plan (e.g. examples/porto-2026) and, from 07-02,
// a generated plan against its template. Pure.
import { addDays, format, getISODay, parseISO, startOfWeek } from 'date-fns'

export interface PlanLike { date: string; type: string; km?: number; notes?: string; pace?: string; key?: boolean; title?: string }
export type Phase = 'base' | 'build' | 'peak' | 'taper'
export interface Split { easy: number; moderate: number; hard: number }

export interface WeekMeasure {
  start: string; km: number; share: number; runs: number; keySessions: number; longKm: number
  moderateKm: number; hardKm: number; recovery: boolean; phase: Phase
}

export interface PlanMeasure {
  weeks: WeekMeasure[]
  peakKm: number
  startShare: number
  split: { base: number; build: number; peak: number }
  phaseVolume: Record<'base' | 'build' | 'peak', [number, number]>
  rampMax: number
  recovery: { every: number | null; volume: number | null; weeks: string[] }
  taper: { weeks: number; volume: number[] }
  intensity: Record<Phase, Split>
  runsPerWeek: number
  keySessions: Record<Phase, number>
  longRun: { maxKm: number; share: number }
  weekdays: Record<number, string>      // ISO weekday → most common session type (non-taper weeks)
}

// Quality part of a session from its notes: "3 × 4 km @ 4:23", "8×1km @3:52–3:58", "9km Threshold @4:10–4:18", "15 km @ 4:23".
// Pace ranges count with their midpoint.
export function qualityParts(notes = ''): { km: number; paceS: number }[] {
  const num = (s: string) => Number(s.replace(',', '.'))
  const pace = (a: string, b?: string) => {
    const s = (p: string) => Number(p.split(':')[0]) * 60 + Number(p.split(':')[1])
    return b ? Math.round((s(a) + s(b)) / 2) : s(a)
  }
  const reps = notes.match(/(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*km\s*\(?[^@]{0,20}?@\s*(\d:\d{2})(?:\s*[–-]\s*(\d:\d{2}))?/)
  if (reps) return [{ km: num(reps[1]) * num(reps[2]), paceS: pace(reps[3], reps[4]) }]
  const block = notes.match(/(\d+(?:[.,]\d+)?)\s*km[^@\d]{0,30}@\s*(\d:\d{2})(?:\s*[–-]\s*(\d:\d{2}))?/)
  if (block) return [{ km: num(block[1]), paceS: pace(block[2], block[3]) }]
  return []
}

const MODERATE_BAND_S = 15   // quality km up to 15 s/km faster than race pace = moderate; faster = hard

const r2 = (n: number) => Math.round(n * 100) / 100
const r1 = (n: number) => Math.round(n * 10) / 10
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const monday = (d: string) => format(startOfWeek(parseISO(d), { weekStartsOn: 1 }), 'yyyy-MM-dd')
const volumeKm = (s: PlanLike) => (s.type !== 'rest' && s.type !== 'race' ? s.km ?? 0 : 0)

export function describePlan(sessions: PlanLike[], opts: { raceDate: string; racePaceS: number }): PlanMeasure {
  const raceWeek = monday(opts.raceDate)
  const byWeek = new Map<string, PlanLike[]>()
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const w = monday(s.date)
    if (w > raceWeek) continue
    byWeek.set(w, [...(byWeek.get(w) ?? []), s])
  }
  // Fill gaps so the curve has every calendar week.
  const starts = [...byWeek.keys()].sort()
  const all: string[] = []
  for (let w = starts[0]; w <= raceWeek; w = format(addDays(parseISO(w), 7), 'yyyy-MM-dd')) all.push(w)

  const raw = all.map((start) => {
    const list = byWeek.get(start) ?? []
    let moderateKm = 0, hardKm = 0, keySessions = 0
    for (const s of list) {
      if (s.type === 'race' || s.type === 'rest') continue
      const parts = qualityParts(s.notes)
      if (parts.length || s.key) keySessions++
      for (const p of parts) {
        if (p.paceS >= opts.racePaceS - MODERATE_BAND_S) moderateKm += p.km
        else hardKm += p.km
      }
    }
    return {
      start, km: r1(list.reduce((t, s) => t + volumeKm(s), 0)),
      runs: list.filter((s) => s.type !== 'rest' && (s.km ?? 0) > 0).length,
      keySessions, moderateKm: r1(moderateKm), hardKm: r1(hardKm),
      longKm: Math.max(0, ...list.filter((s) => s.type === 'long').map((s) => s.km ?? 0)),
    }
  })

  const peakKm = Math.max(...raw.map((w) => w.km))
  // Taper: the weeks after the last week at ≥ 85 % of peak, race week included.
  const lastHigh = raw.reduce((i, w, k) => (w.km >= 0.85 * peakKm ? k : i), 0)
  const taperFrom = lastHigh + 1
  const nonTaper = raw.slice(0, taperFrom)
  // Recovery week: ≥ 20 % below the week before (outside the taper).
  const recovery = raw.map((w, i) => i > 0 && i < taperFrom && w.km <= 0.8 * raw[i - 1].km)
  // Phases: base until the first week at ≥ 75 % of peak, peak = the last 4 weeks before the taper, build in between.
  const firstHigh = Math.max(0, nonTaper.findIndex((w) => w.km >= 0.75 * peakKm))
  const peakFrom = Math.max(firstHigh, taperFrom - 4)
  const phaseOf = (i: number): Phase => (i >= taperFrom ? 'taper' : i >= peakFrom ? 'peak' : i >= firstHigh ? 'build' : 'base')

  const weeks: WeekMeasure[] = raw.map((w, i) => ({ ...w, share: r2(w.km / peakKm), recovery: recovery[i], phase: phaseOf(i) }))
  const inPhase = (p: Phase) => weeks.filter((w) => w.phase === p)
  const count = (p: Phase) => inPhase(p).length

  // Weekly ramp: between two normal weeks (not right after a recovery week, not from the very first week into the plan).
  let rampMax = 0
  for (let i = 2; i < taperFrom; i++) {
    if (recovery[i] || recovery[i - 1]) continue
    rampMax = Math.max(rampMax, weeks[i].km / weeks[i - 1].km - 1)
  }
  const recIdx = weeks.map((w, i) => (w.recovery ? i : -1)).filter((i) => i >= 0)
  const gaps = recIdx.map((i, k) => (k === 0 ? i + 1 : i - recIdx[k - 1]))

  const split = (p: Phase): Split => {
    const ws = inPhase(p)
    const km = ws.reduce((t, w) => t + w.km, 0) || 1
    const moderate = ws.reduce((t, w) => t + w.moderateKm, 0) / km
    const hard = ws.reduce((t, w) => t + w.hardKm, 0) / km
    return { easy: r2(1 - moderate - hard), moderate: r2(moderate), hard: r2(hard) }
  }
  const range = (p: 'base' | 'build' | 'peak'): [number, number] => {
    const ws = inPhase(p).filter((w) => !w.recovery)
    return ws.length ? [ws[0].share, ws[ws.length - 1].share] : [0, 0]
  }

  const weekdays: Record<number, string> = {}
  for (let d = 1; d <= 7; d++) {
    const types = sessions.filter((s) => monday(s.date) < weeks[taperFrom]?.start && getISODay(parseISO(s.date)) === d).map((s) => s.type)
    const tally = new Map<string, number>()
    types.forEach((t) => tally.set(t, (tally.get(t) ?? 0) + 1))
    weekdays[d] = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'rest'
  }

  return {
    weeks, peakKm,
    startShare: weeks[0].share,
    split: { base: r2(count('base') / taperFrom), build: r2(count('build') / taperFrom), peak: r2(count('peak') / taperFrom) },
    phaseVolume: { base: range('base'), build: range('build'), peak: range('peak') },
    rampMax: r2(rampMax),
    recovery: { every: gaps.length ? median(gaps) : null, volume: recIdx.length ? r2(recIdx.reduce((t, i) => t + weeks[i].km / weeks[i - 1].km, 0) / recIdx.length) : null, weeks: recIdx.map((i) => weeks[i].start) },
    taper: { weeks: weeks.length - taperFrom, volume: weeks.slice(taperFrom).map((w) => w.share) },
    intensity: { base: split('base'), build: split('build'), peak: split('peak'), taper: split('taper') },
    runsPerWeek: median(nonTaper.map((w) => w.runs)),
    keySessions: { base: median(inPhase('base').map((w) => w.keySessions)), build: median(inPhase('build').map((w) => w.keySessions)), peak: median(inPhase('peak').map((w) => w.keySessions)), taper: median(inPhase('taper').map((w) => w.keySessions)) },
    longRun: { maxKm: Math.max(...weeks.map((w) => w.longKm)), share: r2(Math.max(...nonTaper.map((w) => (w.km ? w.longKm / w.km : 0)))) },
    weekdays,
  }
}
