// Zielzeit-Prognose: a conservative estimate for the race of today's block from its race-pace blocks only (07-20: any
// distance). Training best efforts are not used — they were not all-out. Pure.
import { addDays, format, parseISO } from 'date-fns'
import { inRaceWindow, raceOf } from '@/lib/plan/blocks'
import { type PlanSession } from '@/lib/plan/types'
import { fmtClock, paceToS, qualityKm } from '@/lib/plan/format'
import { athlete } from '@/lib/athlete'
import { raceHr } from '@/lib/analytics/hr'
import { matchSessionRuns, qualityBlock, type DatedRun } from '@/lib/plan/pace-check'

const WINDOW_DAYS = 42
const HR_PENALTY_S = 1.5               // s/km per bpm above the reference HR; no bonus below
// Per race distance. Marathon: reference = the HR of the marathon PB (athlete().pb.hr); fade from block to race
// 10 / 5 / 0 s/km (intervals / short / ≥ 15 km continuous: 20 km at race pace under the race HR cap means starting on
// the goal pace).
// Shorter races fade less over a shorter distance (convention): half 5 / 3 / 0 from 10 km, 10 km 3 / 0 / 0 from 6 km.
function model(distanceKm: number) {
  if (distanceKm > 30) return { minKm: 6, hr: athlete().pb.hr, fade: { interval: 10, short: 5, long: 0 }, longKm: 15 }
  if (distanceKm > 15) return { minKm: 4, hr: raceHr(distanceKm).cap - 2, fade: { interval: 5, short: 3, long: 0 }, longKm: 10 }
  return { minKm: 3, hr: raceHr(distanceKm).cap - 2, fade: { interval: 3, short: 0, long: 0 }, longKm: 6 }
}
const SINGLE_RANGE_S = 120             // ± for one block, marathon; scaled by distance
export const MARATHON_KM = 42.195

export interface PredictionBlock {
  date: string          // session date
  ranOn: string         // run date (differs when days were swapped)
  title: string
  km: number
  paceS: number
  hr: number | null
  kind: 'interval' | 'continuous'
  estPaceS: number      // estimated marathon pace from this block
}

export type PredictionVerdict = 'realistisch' | 'offen' | 'langsamer'

export interface RacePrediction {
  blocks: PredictionBlock[]
  timeS?: number
  lowS?: number
  highS?: number
  verdict?: PredictionVerdict
  text?: string
}

export function racePrediction({ today, sessions, runs }: { today: string; sessions: PlanSession[]; runs: DatedRun[] }): RacePrediction {
  const race = raceOf(today)
  const M = model(race.distanceKm)
  const from = format(addDays(parseISO(today), -WINDOW_DAYS), 'yyyy-MM-dd')
  const window = sessions.filter((s) => s.date >= from && s.date < today && s.type !== 'rest' && inRaceWindow(s.date, race))
  const matched = matchSessionRuns(window, runs)

  const blocks: PredictionBlock[] = []
  for (const s of window) {
    if (!s.key || !s.pace || s.type === 'race' || paceToS(s.pace) < race.goalPaceS || qualityKm(s) < M.minKm) continue
    const run = matched.get(s.date)
    const b = run ? qualityBlock(s, run) : null
    if (!run || !b) continue
    const kind = /\d+\s*×\s*\d+\s*km/.test(s.notes ?? '') ? 'interval' : 'continuous'
    const fade = kind === 'interval' ? M.fade.interval : b.km >= M.longKm ? M.fade.long : M.fade.short
    const penalty = b.hr != null ? HR_PENALTY_S * Math.max(0, b.hr - M.hr) : 0
    blocks.push({ date: s.date, ranOn: run.date, title: s.title, km: b.km, paceS: Math.round(b.paceS), hr: b.hr, kind,
      estPaceS: Math.round(b.paceS + penalty + fade) })
  }
  if (!blocks.length) return { blocks }

  const km = blocks.reduce((t, b) => t + b.km, 0)
  const mean = blocks.reduce((t, b) => t + b.estPaceS * b.km, 0) / km
  const D = race.distanceKm
  const timeS = Math.round(mean * D)
  const ests = blocks.map((b) => Math.round(b.estPaceS * D))
  const range = Math.round(SINGLE_RANGE_S * D / MARATHON_KM)
  const [lowS, highS] = blocks.length > 1 ? [Math.min(...ests), Math.max(...ests)] : [timeS - range, timeS + range]
  const goal = fmtClock(race.goalS), fallback = fmtClock(race.fallbackS)
  const verdict: PredictionVerdict = timeS < race.goalS + 60 ? 'realistisch' : timeS < race.fallbackS + 60 ? 'offen' : 'langsamer'
  const text = verdict === 'realistisch' ? `${goal} realistisch`
    : verdict === 'offen' ? `offen zwischen ${goal} und ${fallback}` : `eher ${fallback} oder langsamer`
  return { blocks: blocks.sort((a, b) => b.date.localeCompare(a.date)), timeS, lowS, highS, verdict, text }
}
