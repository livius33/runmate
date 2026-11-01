// Overlay Wochenfeedback (07-26): the finished week in one view, and the rule for when the overlay opens by itself.
// Pure and rule-based — builds on weekReview() (lib/insights/week.ts) and the day model of lib/plan/effective.ts.
import { addDays, format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import type { PlanSession, PlanWeek, SessionType } from '@/lib/plan/types'
import { fmtKm, fmtPace } from '@/lib/plan/format'
import { dayLabel, planWeeks, runMark, weekSummary, type DayStatus } from '@/lib/plan/effective'
import { checkPace, matchSessionRuns, type DatedRun } from '@/lib/plan/pace-check'
import type { EngineChange } from '@/lib/plan/engine'
import { acwr } from '@/lib/analytics/load'
import { weekReview, type WeekReviewResult } from './week'
import type { WeekFeedbackEntry } from '@/lib/feedback/week'

const DUE_DAYS = 7           // the overlay offers the finished week during the week right after it
const ACWR_WINDOW = 28       // ACWR needs the full chronic window of runs before the week's end

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')

// ─── When the overlay opens ───────────────────────────────────────────────────

// The week to review: the latest plan week that has ended before today (plain string dates, so KW53 and the
// clock-change weeks are ordinary Monday–Sunday weeks).
export function reviewWeekFor(today: string, weeks: PlanWeek[] = planWeeks()): PlanWeek | null {
  let latest: PlanWeek | null = null
  for (const w of weeks) if (w.end < today && (!latest || w.start > latest.start)) latest = w
  return latest
}

// The week the overlay opens for by itself, or null: only during the week after it, only while no rating is stored
// and it was not put off ("Später") in this browser.
export function feedbackDue({ today, weeks = planWeeks(), byWeek, dismissed }: {
  today: string
  weeks?: PlanWeek[]
  byWeek: Record<string, WeekFeedbackEntry>
  dismissed: string | null
}): PlanWeek | null {
  const week = reviewWeekFor(today, weeks)
  if (!week) return null
  if (today > day(week.end, DUE_DAYS)) return null
  if (byWeek[week.start]) return null
  if (dismissed === week.start) return null
  return week
}

// ─── The finished week in one view ────────────────────────────────────────────

export interface LoadPoint { date: string; ctl: number; atl: number; tsb: number }

export interface DayStrip {
  date: string
  label: string             // Mo … So
  type: SessionType | null
  key: boolean
  plannedKm: number
  actualKm: number
  status: DayStatus
  ran: boolean
  diffKm: number | null
}

export interface NotableRun { kind: 'longest' | 'fastest' | 'extra'; date: string; text: string }

export interface WeekLoad {
  ctlStart: number | null
  ctlEnd: number | null
  atlEnd: number | null
  tsbEnd: number | null
  acwr: number | null
}

export interface NextWeek { kw: number; start: string; end: string; km: number; focus: string; keys: string[] }

export interface WeekOverview {
  review: WeekReviewResult
  days: DayStrip[]
  plannedRuns: number
  engine: { id: string; at: string; reason: string }[]
  notable: NotableRun[]
  load: WeekLoad
  next: NextWeek | null
}

// The last fitness point on or before `date` (the series has one point per day with load; gaps are filled by the
// model, but the API may start later than the week).
function loadAt(fitness: LoadPoint[], date: string): LoadPoint | null {
  let best: LoadPoint | null = null
  for (const p of fitness) if (p.date <= date && (!best || p.date > best.date)) best = p
  return best
}

export function weekOverview({ week, today, sessions, runs, fitness, engineLog, runsSince }: {
  week: PlanWeek
  today: string
  sessions: PlanSession[]
  runs: DatedRun[]
  fitness: LoadPoint[]
  engineLog: EngineChange[]
  runsSince?: string         // first date the runs cover (default: the plan's first week) — ACWR needs 28 days
}): WeekOverview {
  const review = weekReview({ week, today, sessions, runs, fitness, engineLog })
  const inWeek = (d: string) => d >= week.start && d <= week.end
  const weekRuns = runs.filter((r) => inWeek(r.date) && r.date <= today)
  const actual = new Map<string, number>()
  for (const r of weekRuns) actual.set(r.date, Math.round(((actual.get(r.date) ?? 0) + r.km) * 10) / 10)
  const summary = weekSummary(week, today, sessions, actual)

  const days: DayStrip[] = summary.days.map((d) => {
    const mark = runMark(d)
    return {
      date: d.date, label: format(parseISO(d.date), 'EEEEEE', { locale: de }), type: d.session?.type ?? null,
      key: !!d.session?.key, plannedKm: d.plannedKm, actualKm: d.actualKm, status: d.status, ran: mark.ran, diffKm: mark.diffKm,
    }
  })
  const plannedRuns = summary.days.filter((d) => d.session && d.session.type !== 'rest' && d.session.type !== 'race' && !d.session.paused).length

  const engine = engineLog
    .filter((c) => c.status === 'active' && Object.keys(c.after).some(inWeek))
    .map((c) => ({ id: c.id, at: c.at, reason: c.reason }))

  // Notable runs, each kind at most once: the longest run (when there was more than one), the fastest quality run
  // (its block pace against the target), and a run on a day with no planned run.
  const notable: NotableRun[] = []
  if (weekRuns.length >= 2) {
    const longest = [...weekRuns].sort((a, b) => b.km - a.km)[0]
    notable.push({ kind: 'longest', date: longest.date, text: `Längster Lauf: ${dayLabel(longest.date)}, ${fmtKm(longest.km)} km` })
  }
  const quality = sessions.filter((s) => inWeek(s.date) && s.date <= today && !!s.pace && s.type !== 'race' && s.type !== 'rest')
  const matched = matchSessionRuns(quality, weekRuns)
  let fastest: { s: PlanSession; actualS: number; deltaS: number } | null = null
  for (const s of quality) {
    const run = matched.get(s.date)
    if (!run) continue
    const c = checkPace(s, run)
    if (c.actualS == null || c.deltaS == null) continue
    if (!fastest || c.actualS < fastest.actualS) fastest = { s, actualS: c.actualS, deltaS: c.deltaS }
  }
  if (fastest) {
    const delta = fastest.deltaS > 0 ? `+${fastest.deltaS}` : fastest.deltaS < 0 ? `−${-fastest.deltaS}` : '±0'
    notable.push({ kind: 'fastest', date: fastest.s.date, text: `Schnellste Qualität: ${dayLabel(fastest.s.date)}, ${fastest.s.title} ${fmtPace(fastest.actualS)}/km (${delta} s zum Ziel)` })
  }
  const extra = summary.days.find((d) => d.status === 'extra')
  if (extra) notable.push({ kind: 'extra', date: extra.date, text: `Zusätzlicher Lauf: ${dayLabel(extra.date)}, ${fmtKm(extra.actualKm)} km ohne geplante Einheit` })

  const start = loadAt(fitness, day(week.start, -1)) ?? loadAt(fitness, week.start)
  const end = loadAt(fitness, review.running ? today : week.end)
  const since = runsSince ?? planWeeks()[0]?.start ?? week.start
  const acwrEnd = since <= day(week.end, -(ACWR_WINDOW - 1))
    ? acwr(runs.filter((r) => r.date <= week.end).map((r) => ({ date: r.date, distanceM: r.km * 1000 })), parseISO(week.end))
    : null
  const load: WeekLoad = {
    ctlStart: start ? Math.round(start.ctl) : null,
    ctlEnd: end ? Math.round(end.ctl) : null,
    atlEnd: end ? Math.round(end.atl) : null,
    tsbEnd: end ? Math.round(end.tsb) : null,
    acwr: acwrEnd && acwrEnd.chronicKm > 0 ? Math.round(acwrEnd.acwr * 100) / 100 : null,
  }

  const nextWeek = planWeeks().find((w) => w.start > week.end) ?? null
  const next: NextWeek | null = nextWeek && {
    kw: nextWeek.kw, start: nextWeek.start, end: nextWeek.end, km: nextWeek.km, focus: nextWeek.focus,
    keys: sessions.filter((s) => s.key && s.date >= nextWeek.start && s.date <= nextWeek.end).map((s) => s.title),
  }

  return { review, days, plannedRuns, engine, notable, load, next }
}

// Rule-based one-liner for the ACWR figure (the same thresholds the readiness card uses).
export function acwrText(v: number | null): string {
  if (v == null) return 'noch keine 4 Wochen Daten'
  if (v > 1.5) return 'deutlich über dem Gewohnten'
  if (v > 1.3) return 'über dem Gewohnten'
  if (v < 0.8) return 'unter dem Gewohnten'
  return 'im gewohnten Bereich'
}
