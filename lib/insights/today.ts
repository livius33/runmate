// The "Heute" insight: today's session with targets, why it looks like that, yesterday's result
// and one piece of advice. Pure and rule-based — every sentence comes from fixed priorities.
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { hrZones, blockHrCap, isRacePaceWork } from '@/lib/analytics/hr'
import { racePlan } from '@/lib/plan/race-day'
import { activeBlock, raceOf, blockPaces } from '@/lib/plan/blocks'
import { type PlanSession } from '@/lib/plan/types'
import { fmtClock, fmtKm, fmtPace, paceToS } from '@/lib/plan/format'
import { athlete } from '@/lib/athlete'
import { changedBy, dayLabel, isHard, type Overrides } from '@/lib/plan/effective'
import { checkPace, matchSessionRuns, type DatedRun } from '@/lib/plan/pace-check'
import { tired, type EngineChange } from '@/lib/plan/engine'
import { raceWeekDay } from '@/lib/plan/race-week'
import { acwrCaution, acwrStreak, acwrWhy, recoveryRedWhy, rulesFor } from '@/lib/plan/rules'
import { flagsText, lastNightLine, type NightLine, type RecoveryDay } from '@/lib/analytics/recovery-data'
import { strengthToday } from '@/lib/plan/strength'

export type TodayState = 'race' | 'done' | 'rest' | 'hard' | 'easy'

export interface TodayInsight {
  state: TodayState
  session?: PlanSession
  targets: string[]
  why: string[]
  yesterday?: string
  advice: string
  caution?: string               // 07-23: ACWR high, but not on enough days to change the plan
  night?: NightLine              // "Letzte Nacht: …" (only when wellness data is available at all)
  hint?: string                  // a night flag that does not count as tired: "Heute eher locker halten (…)"
  strength?: string              // today's kettlebell marker ("Danach Kettlebell …" / "… auslassen" when tired)
}

const Z2 = () => hrZones()[1]
const Z4 = () => hrZones()[3]
const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0')

// Targets from the one HR model: easy = Z2, race pace (or slower) = under the race HR cap,
// faster quality work = Z4.
export function sessionTargets(s: PlanSession): string[] {
  if (s.type === 'rest') return []
  const race = raceOf(s.date)
  if (s.type === 'race') {
    const [first, main] = racePlan('A', race)
    const cap = main?.hrCap ?? first.hrCap
    return [`Ziel ${fmtClock(race.goalS)}`, `${fmtPace(race.goalPaceS)}/km`, ...(cap ? [`HF unter ${cap} bis km ${fmtKm((main ?? first).to)}`] : [])]
  }
  if (!s.pace) return [`HF ${Z2().min}–${Z2().max}`, `ca. ${blockPaces(s.date).easy}/km`]
  if (isRacePaceWork(paceToS(s.pace), race)) return [`Block @ ${s.pace}/km`, `HF unter ${blockHrCap(paceToS(s.pace), race)}`]
  return [`Block @ ${s.pace}/km`, `HF ${Z4().min}–${Z4().max}`]
}

// Starts from what was actually run yesterday and finds the session that run stood in for
// (same swap-aware pairing as the PaceCard), so swapped days read right.
function yesterdayText(today: string, sessions: PlanSession[], runs: DatedRun[]): string | undefined {
  const y = day(today, -1)
  const ys = sessions.find((s) => s.date === y)
  const yRuns = runs.filter((r) => r.date === y)
  if (!yRuns.length) return ys && ys.type !== 'rest' ? `Gestern: ${ys.title}: kein Lauf.` : undefined

  const run = [...yRuns].sort((a, b) => b.km - a.km)[0]
  const around = sessions.filter((s) => s.date >= day(y, -1) && s.date <= day(y, 1) && s.type !== 'rest')
  const pairedDate = [...matchSessionRuns(around, runs)].find(([, r]) => r?.id === run.id)?.[0]
  const ps = pairedDate ? around.find((s) => s.date === pairedDate) : undefined
  const pace = run.paceS ? ` in ${fmtPace(run.paceS)}/km` : ''
  if (!ps) return `Gestern: ${fmtKm(run.km)} km${pace}, ohne Plan-Einheit.`

  const c = checkPace(ps, run)
  const when = pairedDate !== y ? ` (geplant ${dayLabel(pairedDate!)})` : ''
  if (c.actualS == null) return `Gestern: ${ps.title}${when}: ${fmtKm(run.km)} km${pace}.`
  if (c.kind === 'quality')
    return `Gestern: ${ps.title}${when}: Block ${fmtPace(c.actualS)} (${signed(c.deltaS!)} s)${c.blockHr != null ? `, Block-HF ${c.blockHr}` : ''}.`
  if (c.kind === 'whole') return `Gestern: ${ps.title}${when}: ${fmtPace(c.actualS)} (Ziel ${fmtPace(c.targetS)}).`
  return `Gestern: ${ps.title}${when}: ${fmtPace(c.actualS)}${c.hr?.avg != null ? `, Ø HF ${c.hr.avg} / ${c.hr.cap}` : ''}.`
}

export function todayInsight({ today, sessions, manual, engineLog, runs, tsb, acwr, acwrRecent, recovery }: {
  today: string
  sessions: PlanSession[]
  manual: Overrides
  engineLog: EngineChange[]
  runs: DatedRun[]
  tsb: number | null
  acwr: number | null
  acwrRecent?: (number | null)[]   // today first (07-23)
  recovery?: RecoveryDay           // this morning from the night; undefined = no wellness data (nothing shown)
}): TodayInsight {
  const s = sessions.find((x) => x.date === today)
  const done = runs.filter((r) => r.date === today)
  const block = activeBlock(today)
  const daysToRace = differenceInCalendarDays(parseISO(block.race.date), parseISO(today))
  const state: TodayState = s?.type === 'race' ? 'race' : done.length ? 'done'
    : !s || s.type === 'rest' ? 'rest' : isHard(s) ? 'hard' : 'easy'

  // An own session lies on top of an engine change; a kettlebell marker alone is no changed session (changedBy).
  const reasons = engineLog.filter((c) => c.status === 'active' && c.after[today]).map((c) => c.reason)
  const by = changedBy(manual[today], reasons.length > 0)
  const why = by === 'manual' ? ['Von dir angepasst.'] : by === 'engine' ? reasons : []

  const fitness = { tsb, acwr, acwrRecent, ...(recovery?.flags.length ? { recovery: { date: recovery.date, flags: recovery.flags } } : {}) }
  const rules = rulesFor(today)                                // the red zone of today's block
  const tiredWhy = [
    tsb != null && tsb < rules.tsbRed ? `TSB ${String(Math.round(tsb)).replace('-', '−')}` : null,
    acwr != null && acwrStreak(fitness, rules) >= 1 ? acwrWhy(fitness, rules) : null,
    recoveryRedWhy(fitness),
  ].filter(Boolean).join(', ')
  // A night flag that does not count as tired (one flag): a hint only, the plan stays.
  const hint = recovery?.flags.length && !tired(fitness, rules) && (state === 'hard' || state === 'easy')
    ? `Heute eher locker halten (${flagsText(recovery.flags)}).` : undefined

  let advice: string
  if (state === 'race') {
    const SPLITS = racePlan('A', raceOf(today))
    const [start, main] = SPLITS
    advice = `Rennen: die ersten ${start.to} km in ${fmtPace(start.paceS)}, dann ${fmtPace(main.paceS)}${main.hrCap ? `; HF bis km ${fmtKm(main.to)} unter ${main.hrCap}` : ''}. Ab km ${SPLITS[SPLITS.length - 1].from}: alles, was da ist.`
  } else if (daysToRace > 0 && raceWeekDay(today)) {
    advice = raceWeekDay(today)!.focus[0]                     // the race-week plan for this day
  } else if (state === 'done') {
    const km = done.reduce((t, r) => t + r.km, 0)
    const longest = [...done].sort((a, b) => b.km - a.km)[0]
    advice = `Erledigt: ${fmtKm(km)} km${longest.paceS ? ` in ${fmtPace(longest.paceS)}/km` : ''}. Jetzt erholen.`
  } else if (daysToRace < 0 && !s && today > block.end) {
    advice = 'Noch kein Plan für den nächsten Block.'
  } else if (daysToRace < 0 && state === 'rest') {
    advice = 'Ruhetag: Erholung ist Training. Beine hoch, früh schlafen.'
  } else if (daysToRace < 0) {
    advice = `Erholungslauf: sehr locker, HF unter ${Z2().max}. Bei Schmerzen lieber Pause.`
  } else if (tired(fitness, rules)) {
    advice = `Sehr müde (${tiredWhy}): heute locker, notfalls kürzen.`
  } else if (state === 'rest') {
    advice = 'Ruhetag: Beine hoch, früh schlafen.'
  } else if (state === 'hard') {
    const cap = s!.pace ? blockHrCap(paceToS(s!.pace), block.race) : Z4().max
    advice = `Erholt starten; wenn die HF im Block über ${cap} steigt, Tempo rausnehmen.`
  } else {
    advice = `Wirklich locker: HF unter ${Z2().max}, lieber langsamer als zu schnell.`
  }

  return {
    state,
    session: s && s.type !== 'rest' ? s : undefined,
    targets: s ? sessionTargets(s) : [],
    why,
    yesterday: yesterdayText(today, sessions, runs),
    advice,
    ...(s?.strength && s.type !== 'race' && !s.paused ? { strength: strengthToday(s, tired(fitness, rules) ? tiredWhy || 'sehr müde' : null)! } : {}),
    ...(acwr != null && acwrCaution(fitness, rules)
      ? { caution: `Belastung hoch (ACWR ${acwr.toFixed(2)}, ${acwrStreak(fitness, rules)}. Tag): vorsichtig, noch keine Planänderung.` } : {}),
    ...(recovery ? { night: lastNightLine(recovery) } : {}),
    ...(hint ? { hint } : {}),
  }
}
