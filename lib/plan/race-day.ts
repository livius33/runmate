// Race day: Plan A (goal) or B (fallback) by the plan's own test rule (latest race-pace test run), checkpoints with
// clock times, and the gel plan — for the race of any training block (07-15). Pure.
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { type PlanSession, type RaceInfo } from './types'
import { inRaceWindow, raceOf } from './blocks'
import { todayInHamburg } from '@/lib/dates'
import { HR_MAX, HR_ZONES, raceHr } from '@/lib/analytics/hr'
import { fmtClock, fmtKm, fmtPace } from './format'
import { ATHLETE } from '@/lib/athlete'
import { dayLabel } from './effective'
import { blockAttempted, matchSessionRuns, qualityBlock, type DatedRun } from './pace-check'
import type { EngineChange } from './engine'

export type PlanKind = 'A' | 'B'
export interface Section { from: number; to: number; paceS: number; hrCap: number | null; focus: string }

const GEL_G = 25
const DEFAULT_START = '09:00'       // a generated race without a start time
export const MARATHON_KM = 42.195
const currentRace = (): RaceInfo => raceOf(todayInHamburg())

const isMarathon = (r: RaceInfo) => r.distanceKm > 40
const hrAt = (share: number) => Math.round(HR_MAX * share)
const isHalf = (r: RaceInfo) => r.distanceKm > 20 && r.distanceKm < 22

// The race's own splits, else a plan from its goal pace: slightly slower start, race pace, the rest of the goal time
// for the last section. HR caps: example marathon values (TODO(Phase 2): from the user's HR profile); shorter races
// only a start cap (Z4 max).
export function splitsFor(r: RaceInfo): Section[] {
  if (r.splits) return r.splits
  const p = r.goalPaceS
  const shape: Omit<Section, 'paceS'>[] & { d: number }[] = (isMarathon(r)
    ? [{ from: 0, to: 5, d: 4, hrCap: hrAt(0.8), focus: 'Ruhig anlaufen, Gruppe finden' }, { from: 5, to: 21.1, d: 0, hrCap: hrAt(0.84), focus: 'Renntempo, entspannt' },
      { from: 21.1, to: 30, d: -1, hrCap: hrAt(0.86), focus: 'Rhythmus halten, verpflegen' }, { from: 30, to: 38, d: 0, hrCap: hrAt(0.88), focus: 'Konzentriert bleiben' },
      { from: 38, to: r.distanceKm, d: NaN, hrCap: null, focus: 'Alles, was da ist' }]
    : isHalf(r)
      ? [{ from: 0, to: 3, d: 4, hrCap: HR_ZONES[3].max, focus: 'Ruhig anlaufen, nicht mitreißen lassen' }, { from: 3, to: 15, d: 0, hrCap: null, focus: 'Renntempo, gleichmäßig' },
        { from: 15, to: r.distanceKm, d: NaN, hrCap: null, focus: 'Alles, was da ist' }]
      : [{ from: 0, to: 2, d: 3, hrCap: HR_ZONES[3].max, focus: 'Ruhig anlaufen' }, { from: 2, to: r.distanceKm, d: NaN, hrCap: null, focus: 'Renntempo, ab km 8 alles' }])
  const out: Section[] = []
  for (const x of shape) {
    if (!Number.isNaN(x.d)) { out.push({ from: x.from, to: x.to, paceS: p + x.d, hrCap: x.hrCap, focus: x.focus }); continue }
    const used = out.reduce((t, q) => t + (q.to - q.from) * q.paceS, 0)
    out.push({ from: x.from, to: x.to, paceS: Math.floor((r.goalS - used) / (x.to - x.from)), hrCap: x.hrCap, focus: x.focus })
  }
  return out
}

// Plan A: the goal pacing; Plan B: the fallback pace evenly, same HR caps and focus.
export function racePlan(kind: PlanKind, race: RaceInfo = currentRace()): Section[] {
  const splits = splitsFor(race)
  return kind === 'A' ? splits : splits.map((s) => ({ ...s, paceS: race.fallbackPaceS }))
}

export function elapsedAt(plan: Section[], km: number): number {
  return Math.round(plan.reduce((t, s) => t + Math.max(0, Math.min(km, s.to) - s.from) * s.paceS, 0))
}

function kmAt(plan: Section[], elapsedS: number): number {
  let t = 0
  for (const s of plan) {
    const seg = (s.to - s.from) * s.paceS
    if (t + seg >= elapsedS) return s.from + (elapsedS - t) / s.paceS
    t += seg
  }
  return plan[plan.length - 1].to
}

// Time of day: start + elapsed, 'H:MM'.
export function clockAt(elapsedS: number, start = currentRace().startTime ?? DEFAULT_START): string {
  const [h, m] = start.split(':').map(Number)
  const total = h * 60 + m + Math.round(elapsedS / 60)
  return `${Math.floor(total / 60)}:${String(((total % 60) + 60) % 60).padStart(2, '0')}`
}

// Every 5 km, the half-way mark of a marathon, km 38/40 near the end, and the finish.
function checkpointList(distanceKm: number): { km: number; label: string }[] {
  const list: { km: number; label: string }[] = []
  for (let km = 5; km < distanceKm; km += 5) list.push({ km, label: `km ${km}` })
  if (distanceKm > 40) {
    list.splice(4, 0, { km: 21.0975, label: 'Halbmarathon' })
    for (const km of [38, 40]) if (!list.some((c) => c.km === km)) list.push({ km, label: `km ${km}` })
    list.sort((a, b) => a.km - b.km)
  }
  return [...list, { km: distanceKm, label: 'Ziel' }]
}

export function checkpoints(plan: Section[], race: RaceInfo = currentRace()) {
  const start = race.startTime ?? DEFAULT_START
  return checkpointList(plan[plan.length - 1].to).map((c) => {
    const section = plan.find((s) => c.km > s.from && c.km <= s.to) ?? plan[plan.length - 1]
    const elapsedS = elapsedAt(plan, c.km)
    return { ...c, elapsedS, time: fmtClock(elapsedS, true), clock: clockAt(elapsedS, start), paceS: section.paceS, hrCap: section.hrCap }
  })
}

export interface Gel { label: string; km: number | null; clock: string }

// Standard: one gel 15 min before the start, then every 5 km up to km 35.
// "Mehr": every 20 minutes (for a trained stomach). Both with water at the next aid station.
export function gelPlan(plan: Section[], more = false, race: RaceInfo = currentRace()): { gels: Gel[]; gPerHour: number } {
  const start = race.startTime ?? DEFAULT_START
  const distance = plan[plan.length - 1].to
  const finish = elapsedAt(plan, distance)
  const gels: Gel[] = [{ label: 'vor dem Start', km: null, clock: clockAt(-15 * 60, start) }]
  if (more) {
    for (let t = 20 * 60; t <= finish - 25 * 60; t += 20 * 60) {
      const km = Math.round(kmAt(plan, t) * 2) / 2
      gels.push({ label: `km ${km.toLocaleString('de-DE')}`, km, clock: clockAt(t, start) })
    }
  } else {
    for (let km = 5; km <= Math.min(35, distance - 6); km += 5) gels.push({ label: `km ${km}`, km, clock: clockAt(elapsedAt(plan, km), start) })
  }
  return { gels, gPerHour: Math.round((gels.length * GEL_G) / (finish / 3600)) }
}

// A race-pace test as run: block pace and HR (paired swap-aware), or null if not (yet) run.
export function testResult(test: PlanSession, sessions: PlanSession[], runs: DatedRun[], today: string) {
  if (test.date > today) return { session: test, block: null }
  const near = sessions.filter((s) => s.type !== 'rest' && Math.abs(differenceInCalendarDays(parseISO(s.date), parseISO(test.date))) <= 1)
  const run = matchSessionRuns(near, runs).get(test.date)
  const block = run ? qualityBlock(test, run) : null
  // A test run far off the target pace was not attempted: it counts like a missed test.
  return { session: test, block: block && blockAttempted(test.pace, block.paceS) ? block : null }
}

// The plan's race-pace tests (Generalprobe, final test), oldest first.
export const planTests = (sessions: PlanSession[]) => sessions.filter((s) => s.test).sort((a, b) => a.date.localeCompare(b.date))

export interface PlanDecision { kind: PlanKind; reason: string; warning?: string }

export function decidePlan({ today, engineLog, sessions, runs, race: raceIn }: {
  today: string; engineLog: EngineChange[]; sessions: PlanSession[]; runs: DatedRun[]; race?: RaceInfo
}): PlanDecision {
  const race = raceIn ?? raceOf(today)
  const RACE_ = race
  const SPLITS_ = splitsFor(race)
  const brake = SPLITS_[1]?.hrCap ?? SPLITS_[0].hrCap
  const halfway = Math.round(SPLITS_[1]?.to ?? race.distanceKm / 2)
  // Only this race's block counts (07-20): its tests and its engine log, never an earlier block's.
  const hr = raceHr(race.distanceKm)
  const recal = [...engineLog].reverse().find((c) => c.rule === 'recalibrate' && c.status === 'active' && inRaceWindow(c.key.slice('recalibrate:'.length), race))
  if (recal) return { kind: 'B', reason: `${recal.reason} → Plan B: ${fmtPace(RACE_.fallbackPaceS)} anlaufen, Ziel ${fmtClock(RACE_.fallbackS)}.` }

  // The latest test that was run decides; a later one still to come only gets a note.
  const tests = planTests(sessions.filter((s) => inRaceWindow(s.date, race)))
  if (!tests.length) return { kind: 'A', reason: `Kein Test im Plan: Plan A, HF als Bremse (bis km ${halfway} unter ${brake}).` }
  const results = tests.map((t) => testResult(t, sessions, runs, today))
  const last = [...results].reverse().find((r) => r.block)
  const next = results.find((r) => !r.block && r.session.date >= today)
  const nextNote = next ? ` ${next.session.test} am ${dayLabel(next.session.date)} entscheidet endgültig.` : ''
  if (!last) {
    return next
      ? { kind: 'A', reason: `${next.session.test} steht noch an (${dayLabel(next.session.date)}): bis dahin gilt Plan A.` }
      : { kind: 'A', reason: 'Kein Test gelaufen: Plan A mit Vorsicht.', warning: `Steigt die HF vor km ${halfway} über ${brake}, auf ${fmtPace(RACE_.fallbackPaceS)} wechseln.` }
  }
  const block = last.block!
  const seen = `${last.session.test} ${fmtKm(block.km)} km in ${fmtPace(block.paceS)} bei HF ${block.hr ?? '–'}`
  if (block.hr != null && block.hr >= hr.hard) {
    return { kind: 'B', reason: `${seen} → Plan B: ${fmtPace(RACE_.fallbackPaceS)} anlaufen, Ziel ${fmtClock(RACE_.fallbackS)}.${nextNote}` }
  }
  if (block.hr != null && block.hr >= hr.cap) {
    return { kind: 'A', reason: `${seen} → Plan A.${nextNote}`, warning: `Grenzbereich: ${isMarathon(race) ? 'die ersten 10 km' : 'die erste Hälfte'} eher ${fmtPace(RACE_.goalPaceS + 2)} statt ${fmtPace(RACE_.goalPaceS)}.` }
  }
  return { kind: 'A', reason: `${seen} → Plan A: ${fmtClock(RACE_.goalS)}.${nextNote}` }
}

