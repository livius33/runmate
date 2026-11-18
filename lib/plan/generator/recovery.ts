// Recovery after the goal race (07-22; research between-blocks.md §1, logic audit 2026-10-26 finding 12): a generated
// block ends like the example plan (examples/porto-2026) with a reverse taper — weeks at a share of the last load week, week 1 easy only and short, a
// gentle long run from week 2, a first short threshold in the last week. Convention values, marked in the research.
// Pure; generateDraft adds it, freezeDraft appends it to the block.
import { addDays, format, getISODay, getISOWeek, parseISO } from 'date-fns'
import type { Distance } from '../methodology/schema'
import type { PlanSession, PlanWeek } from '../types'
import { formatNotes } from '../structure'
import { fmtKm } from '../format'

export const POST_RACE = {
  shares: { marathon: [0.4, 0.6, 0.75], half: [0.5, 0.8], '10k': [0.6] } as Record<Distance, number[]>,
  week1MaxMin: 40,         // week 1: no run longer than this, at easy pace
  longShare: 0.6,          // from week 2: long run ≤ this × the longest run before the taper
  thresholdMin: 15,        // last week (≥ 2 weeks): one short threshold block
  minRunKm: 4,
}

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const half = (n: number) => Math.floor(n * 2) / 2
const r1 = (n: number) => Math.round(n * 10) / 10
const fmtPace = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`
const FOCUS = ['viel Ruhe, alles locker', 'locker zurück', 'Steigerungen, lockerer Longrun']

export interface RecoveryInput {
  raceDate: string
  distance: Distance
  weeks: PlanWeek[]            // the block's weeks up to race week
  sessions: PlanSession[]      // the block's sessions up to race week
  easyPaceS: number
  thresholdPaceS: number
  maxKm?: (date: string) => number | null   // the profile's day limit (null = none)
}

export function recoveryAfterRace(i: RecoveryInput): { weeks: PlanWeek[]; sessions: PlanSession[] } {
  const shares = POST_RACE.shares[i.distance]
  const load = [...i.weeks].reverse().find((w) => !w.taper && !w.cutback && !w.recovery) ?? i.weeks[0]
  const inWeek = (w: PlanWeek) => i.sessions.filter((s) => s.date >= w.start && s.date <= w.end)
  // Run days and the long-run day as in the last load week.
  const loadRuns = inWeek(load).filter((s) => s.type !== 'rest' && s.type !== 'race' && (s.km ?? 0) > 0)
  const runDays = [...new Set(loadRuns.map((s) => getISODay(parseISO(s.date))))].sort((a, b) => a - b)
  const longDay = getISODay(parseISO(loadRuns.find((s) => s.type === 'long')?.date ?? load.end))
  const beforeTaper = i.weeks.filter((w) => !w.taper && w.end < i.raceDate).slice(-4)
  const longest = Math.max(0, ...beforeTaper.flatMap(inWeek).filter((s) => s.type === 'long').map((s) => s.km ?? 0))
  const maxWeek1 = half((POST_RACE.week1MaxMin * 60) / i.easyPaceS)
  const raceWeekEnd = day(i.raceDate, 7 - getISODay(parseISO(i.raceDate)))

  const weeks: PlanWeek[] = []
  const sessions: PlanSession[] = []
  shares.forEach((share, k) => {
    const start = day(raceWeekEnd, 1 + 7 * k)
    const target = half(share * load.km)
    const last = k === shares.length - 1 && shares.length > 1
    // Week 1 one run fewer (a day more rest), never fewer than 3 runs.
    const days = k === 0 ? runDays.filter((d) => d !== longDay).slice(0, Math.max(3, runDays.length - 1)) : runDays
    const long = k > 0 && days.includes(longDay) ? half(Math.min(POST_RACE.longShare * longest, target * 0.35)) : 0
    const easyDays = days.filter((d) => !(long && d === longDay))
    const each = Math.min(k === 0 ? maxWeek1 : Infinity, half((target - long) / Math.max(1, easyDays.length)))
    const tempoDay = last ? easyDays[Math.floor(easyDays.length / 2)] : null
    const stridesDay = k === shares.length - 1 ? easyDays.find((d) => d !== tempoDay) : null   // one run with strides
    let total = 0
    for (let wd = 1; wd <= 7; wd++) {
      const date = day(start, wd - 1)
      let s: PlanSession = { date, type: 'rest', title: 'Ruhetag', notes: 'Erholung nach dem Rennen.' }
      const top = half(i.maxKm?.(date) ?? Infinity)   // no run above the profile's day limit
      const q = half((POST_RACE.thresholdMin * 60) / i.thresholdPaceS)
      const warm = Math.max(1.5, half((each - q) / 2))
      if (date === day(i.raceDate, 1)) {
        // The day after the race: rest.
      } else if (long && wd === longDay && long >= POST_RACE.minRunKm) {
        s = { date, type: 'long', km: Math.min(long, top), title: 'Lockerer Longrun', notes: 'Erholung nach dem Rennen: ruhig, Zone 2.' }
      } else if (easyDays.includes(wd) && each >= POST_RACE.minRunKm) {
        if (wd === tempoDay && warm * 2 + q <= top) {
          const pace = fmtPace(i.thresholdPaceS)
          s = { date, type: 'tempo', km: r1(warm * 2 + q), title: 'Kurze Schwelle', pace,
            notes: formatNotes({ prefix: '', warmKm: warm, warmWord: 'ein', reps: 1, repKm: q, pace, recKm: 0, recWord: 'Trab', coolKm: warm, coolWord: 'aus',
              suffix: '. Erste Schwelle nach dem Rennen, kontrolliert.' }) }
        } else {
          const strides = wd === stridesDay
          s = { date, type: 'easy', km: Math.min(each, top), title: strides ? 'Locker mit Steigerungen' : 'Lockerer Lauf',
            notes: strides ? 'Erholung nach dem Rennen: locker, 4 × 20 s Steigerungen.' : `Erholung nach dem Rennen: locker, Zone 2${k === 0 ? `, höchstens ${POST_RACE.week1MaxMin} Minuten` : ''}.` }
        }
      }
      if (s.type !== 'rest') total += s.km ?? 0
      sessions.push(s)
    }
    weeks.push({ kw: getISOWeek(parseISO(start)), start, end: day(start, 6), km: r1(total),
      focus: `Erholung ${k + 1}/${shares.length}: ${shares.length === 1 ? 'locker, mit Steigerungen' : FOCUS[Math.min(k, FOCUS.length - 1)]} (${fmtKm(r1(total))} km)`, recovery: true })
  })
  return { weeks, sessions }
}
