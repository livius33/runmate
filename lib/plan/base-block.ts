// Rolling base block (07-17; research between-blocks.md §2–3, superseded 07-08 AC-1…4): when no goal block covers a
// week, a base block does — easy weeks at the recent volume, +5 %/week up to the proven level, one key session, every
// 4th week lighter. Recomputed from the runs whenever the blocks are registered, never stored: a week only reads runs
// before it, so past weeks never change; a goal block going live simply takes its dates. Pure.
import { addDays, differenceInCalendarDays, format, getISODay, getISOWeek, parseISO } from 'date-fns'
import type { AthleteProfile, Weekday } from './athlete-profile'
import type { PlanSession, PlanWeek, TrainingBlock } from './types'
import { formatNotes } from './structure'
import { fmtKm, paceToS } from './format'
import { ACWR_PERSIST_DAYS, DEFAULT_PACES, DEFAULT_RULES, DEFAULT_STOP_RULES } from './rules'
import { NO_BLOCK } from './blocks'

export const BASE = {
  minKm: 30,              // never below (between-blocks.md §2, 07-08 AC-1)
  growth: 0.05,           // ≤ 5 % per week …
  provenWeeks: 52,        // … never above the highest 4-week mean of the last 52 weeks
  cutbackEvery: 4,        // every 4th week …
  cutbackShare: 0.8,      // … at 80 %
  longShare: 0.25,        // long run ≤ 25 % of the week …
  longSpike: 1.1,         // … ≤ 110 % of the longest run of the 30 days before (long-run.md spike rule) …
  longMaxKm: 24,          // … and ≤ 24 km
  longMinKm: 8,           // shorter: no long run that week
  thresholdMin: 20,       // the key session: 20 min threshold (load weeks)
  minRunKm: 6,            // shorter easy runs are dropped (fewer runs in a low week)
  horizonDays: 28,        // after the last block: 4 weeks ahead
}
// Run days without a profile: Mo locker · Di Qualität · Mi · Do locker · Fr Ruhe · Sa Longrun · So.
const DEFAULT_DAYS = { runs: [1, 2, 3, 4, 6, 7] as Weekday[], long: 6 as Weekday, quality: 2 as Weekday }

// `start` (Phase 5 onboarding, "erstmal ohne Ziel"): a base block from that Monday even before any goal block exists.
export interface BaseSettings { v: 1; paused: boolean; capKm: number | null; start?: string | null }
export const BASE_DEFAULTS: BaseSettings = { v: 1, paused: false, capKm: null }
export interface BaseRun { date: string; km: number }
export interface BaseInput {
  blocks: TrainingBlock[]           // goal blocks (built-in + live), any order
  runs: BaseRun[]
  today: string
  profile: AthleteProfile | null
  settings?: BaseSettings | null
}

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const mondayOf = (d: string) => day(d, 1 - getISODay(parseISO(d)))
const half = (n: number) => Math.floor(n * 2) / 2
const r1 = (n: number) => Math.round(n * 10) / 10
const fmtPace = (sec: number) => { const r = Math.round(sec); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}` }
const kmIn = (runs: BaseRun[], from: string, to: string) => runs.filter((r) => r.date >= from && r.date <= to).reduce((t, r) => t + r.km, 0)

// Stand-in for "the block before" a base block that has none (a goal-less start, Phase 5): no race, default rules.
const NO_GOAL: TrainingBlock = { ...NO_BLOCK, id: 'no-goal', stopRules: DEFAULT_STOP_RULES }

// Gaps of whole weeks between blocks, and after the last one up to the horizon. With a goal-less `start` and no goal
// block on or before it: also from that Monday up to the first goal block (or the horizon).
export function baseGaps(blocks: TrainingBlock[], today: string, start: string | null = null): { start: string; end: string; before: TrainingBlock }[] {
  const goal = [...blocks].filter((b) => !b.base).sort((a, b) => a.planStart.localeCompare(b.planStart))
  const horizon = day(mondayOf(day(today, BASE.horizonDays - 1)), 6)
  const out: { start: string; end: string; before: TrainingBlock }[] = []
  if (start && !goal.some((b) => b.planStart <= mondayOf(start))) {
    const s = mondayOf(start)
    const end = goal[0] ? day(goal[0].planStart, -1) : horizon
    const lastSunday = getISODay(parseISO(end)) === 7 ? end : day(mondayOf(end), -1)
    if (differenceInCalendarDays(parseISO(lastSunday), parseISO(s)) >= 6) out.push({ start: s, end: lastSunday, before: NO_GOAL })
  }
  goal.forEach((b, i) => {
    const s = getISODay(parseISO(b.end)) === 7 ? day(b.end, 1) : day(mondayOf(b.end), 7)   // the Monday after the block's last week
    const next = goal[i + 1]
    const end = next ? day(next.planStart, -1) : horizon
    const lastSunday = getISODay(parseISO(end)) === 7 ? end : day(mondayOf(end), -1)
    if (differenceInCalendarDays(parseISO(lastSunday), parseISO(s)) >= 6) out.push({ start: s, end: lastSunday, before: b })
  })
  return out
}

// Week km of a base block: level from the recent volume, finished weeks below plan lower it, +5 % at most, cap = proven.
// `fallbackKm`: the level when no run before the gap is known yet (a new runner's weekly km from the onboarding).
export function baseWeekKm(gap: { start: string; end: string }, runs: BaseRun[], today: string, capKm: number | null = null, fallbackKm: number | null = null): { km: number; cutback: boolean }[] {
  const n = Math.round((differenceInCalendarDays(parseISO(gap.end), parseISO(gap.start)) + 1) / 7)
  // Start: the last 3 weeks, or the last week when it was higher (a reverse taper hands over its top, between-blocks.md §3).
  const mean3 = Math.max(kmIn(runs, day(gap.start, -21), day(gap.start, -1)) / 3, kmIn(runs, day(gap.start, -7), day(gap.start, -1)))
  // Proven: highest 4-week mean of the 52 weeks before the gap.
  let proven = 0
  for (let w = 4; w <= BASE.provenWeeks; w++) proven = Math.max(proven, kmIn(runs, day(gap.start, -7 * w), day(gap.start, -7 * (w - 4) - 1)) / 4)
  const cap = Math.max(BASE.minKm, Math.min(proven || Infinity, capKm ?? Infinity))
  const out: { km: number; cutback: boolean }[] = []
  let level = Math.min(Math.max(BASE.minKm, mean3 || fallbackKm || 0), cap)
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const prevStart = day(gap.start, 7 * (i - 1))
      const prevEnd = day(prevStart, 6)
      let next = level * (1 + BASE.growth)
      if (prevEnd < today) {                               // a finished week run below plan lowers the next one
        const actual = kmIn(runs, prevStart, prevEnd)
        if (actual < out[i - 1].km) next = Math.min(next, level * (actual / out[i - 1].km) * (1 + BASE.growth))
      }
      level = Math.min(Math.max(BASE.minKm, next), cap)
    }
    const cutback = (i + 1) % BASE.cutbackEvery === 0
    out.push({ km: half(cutback ? level * BASE.cutbackShare : level), cutback })
  }
  return out
}

// One base week laid out on the profile days.
function baseWeek(start: string, km: number, cutback: boolean, i: { runs: BaseRun[]; profile: AthleteProfile | null; paces: Record<string, string> }): PlanSession[] {
  const p = i.profile
  const runDays = (p?.availableDays.length ? p.availableDays.filter((d) => d !== p.restDay) : DEFAULT_DAYS.runs).slice().sort((a, b) => a - b)
  const longDay = p?.longRunDay && runDays.includes(p.longRunDay) ? p.longRunDay : runDays.includes(DEFAULT_DAYS.long) ? DEFAULT_DAYS.long : runDays[runDays.length - 1]
  const qDay = (p?.qualityDays ?? [DEFAULT_DAYS.quality]).find((d) => runDays.includes(d) && d !== longDay && d !== (longDay % 7) + 1)
    ?? runDays.find((d) => d !== longDay && d !== (longDay % 7) + 1) ?? null
  const longest30 = Math.max(0, ...i.runs.filter((r) => r.date >= day(start, -30) && r.date < start).map((r) => r.km))
  let long = half(Math.min(BASE.longShare * km, BASE.longSpike * longest30, BASE.longMaxKm))
  if (long < BASE.longMinKm) long = 0
  const tPace = i.paces.threshold ?? DEFAULT_PACES.threshold
  const q = half((BASE.thresholdMin * 60) / paceToS(tPace))
  const key = !cutback && qDay != null
  let easyDays = runDays.filter((d) => !(long && d === longDay))
  // Easy runs share what is left; fewer runs when they would be shorter than minRunKm.
  const rest = () => km - long - (key ? q : 0)          // the key day = an easy run's km plus the threshold part
  while (easyDays.length > 1 && half(rest() / easyDays.length) < BASE.minRunKm) {
    const drop = [...easyDays].reverse().find((d) => d !== qDay) ?? easyDays[easyDays.length - 1]
    easyDays = easyDays.filter((d) => d !== drop)
  }
  const each = half(rest() / Math.max(1, easyDays.length))
  const sessions: PlanSession[] = []
  for (let wd = 1; wd <= 7; wd++) {
    const date = day(start, wd - 1)
    let s: PlanSession = { date, type: 'rest', title: 'Ruhetag', notes: 'Grundlage: Ruhetag.' }
    if (long && wd === longDay) {
      s = { date, type: 'long', km: long, title: 'Grundlage: Longrun', notes: 'Ruhig, Zone 2.' }
    } else if (easyDays.includes(wd as Weekday) && each >= BASE.minRunKm) {
      if (key && wd === qDay) {
        const warm = Math.max(1.5, half(each / 2))
        s = { date, type: 'tempo', km: r1(warm * 2 + q), title: 'Grundlage: Schwelle', pace: tPace, key: true,
          notes: formatNotes({ prefix: '', warmKm: warm, warmWord: 'ein', reps: 1, repKm: q, pace: tPace, recKm: 0, recWord: 'Trab', coolKm: warm, coolWord: 'aus',
            suffix: `. ${BASE.thresholdMin} min Schwelle hält die Form.` }) }
      } else {
        const strides = cutback && wd === qDay
        s = { date, type: 'easy', km: each, title: strides ? 'Grundlage: locker mit Steigerungen' : 'Grundlage: locker',
          notes: strides ? 'Locker, 6 × 20 s Steigerungen.' : 'Locker, Zone 2.' }
      }
    }
    sessions.push(s)
  }
  return sessions
}

// The base blocks for every gap (none when paused).
export function baseBlocks(i: BaseInput): TrainingBlock[] {
  if (i.settings?.paused) return []
  return baseGaps(i.blocks, i.today, i.settings?.start ?? null).map((g) => {
    const plan = baseWeekKm(g, i.runs, i.today, i.settings?.capKm ?? null, g.before === NO_GOAL ? i.profile?.weeklyKm ?? null : null)
    // Without a block before it, the threshold pace comes from the runner's profile when it has one.
    const own: Record<string, string> = g.before === NO_GOAL && i.profile?.thresholdPaceS ? { threshold: fmtPace(i.profile.thresholdPaceS) } : {}
    const paces = { ...(g.before.paces ?? DEFAULT_PACES), ...own }
    const weeks: PlanWeek[] = []
    const sessions: PlanSession[] = []
    plan.forEach((w, k) => {
      const start = day(g.start, 7 * k)
      const days = baseWeek(start, w.km, w.cutback, { runs: i.runs, profile: i.profile, paces })
      const km = r1(days.reduce((t, s) => t + (s.type === 'rest' ? 0 : s.km ?? 0), 0))
      weeks.push({ kw: getISOWeek(parseISO(start)), start, end: day(start, 6), km, cutback: w.cutback || undefined,
        focus: `Grundlage ${k + 1}${w.cutback ? ': leichtere Woche' : ''} (${fmtKm(km)} km)` })
      sessions.push(...days)
    })
    return {
      id: `base-${g.start}`, goalId: 'base', base: true, race: g.before.race, planStart: g.start, end: g.end, weeks, sessions,
      rules: [
        'Grundlagenblock: Umfang auf dem Niveau der letzten Wochen, höchstens 5 % mehr pro Woche, nie über deinem gehaltenen Umfang.',
        'Eine Schlüsseleinheit pro Woche (20 min Schwelle), jede vierte Woche leichter mit Steigerungen.',
        'Longrun höchstens 25 % der Woche und 10 % über dem längsten Lauf der letzten 30 Tage.',
      ],
      stopRules: g.before.stopRules, levers: [], paces,
      engine: { ...(g.before.engine ?? DEFAULT_RULES), acwrPersistDays: ACWR_PERSIST_DAYS },   // 07-23: ACWR alone needs 3 days
    }
  })
}
