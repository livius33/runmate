// Feedback-Loop (07-25): what the runner's run feedback (RPE, Gefühl, Schmerzen) and the weekly feedback (07-26) say about
// the plan. Research feedback.md. Pure: signals out, no plan change here — workshop.ts turns 'easy-too-hard' into a
// Plan-anpassen suggestion with a diff, everything else is a hint. The engine never reads feedback; nothing here ever
// makes a pace faster.
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { isRacePaceWork } from '@/lib/analytics/hr'
import { raceOf } from '@/lib/plan/blocks'
import { paceToS } from '@/lib/plan/format'
import { dayLabel } from '@/lib/plan/effective'
import { checkPace, matchSessionRuns, type DatedRun } from '@/lib/plan/pace-check'
import { pauseEnd, type PauseInput } from '@/lib/plan/pause'
import type { PlanSession } from '@/lib/plan/types'
import { isFeel, type Feel, type Pain } from './run'

export const FEEDBACK_RULES = {
  easyRpeHigh: 6,        // an easy day at RPE ≥ 6 was too hard (easy = 2–4 on CR-10, feedback.md §2)
  longRpeHigh: 7,        // long runs score higher by duration alone (Fusco 2020)
  easyFeelLow: 2,        // … or Gefühl ≤ 2
  windowDays: 7,         // signals counted over today and the 6 days before
  signalsNeeded: 2,      // flagged runs (+ 1 for a tired week) before the next hard session is offered as easy
  weekFatigueHigh: 4,    // weekly feedback fatigue ≥ 4 counts as one signal
  painStopDays: 3,       // pain 'stop' within the last n days → Pause hint
  painLightRuns: 3,      // light pain on n runs …
  painLightDays: 14,     // … within n days → watch hint
  goalPaceRpeLow: 4,     // race-pace session on target at RPE ≤ 4 …
  goalPaceRuns: 2,       // … n times …
  goalPaceDays: 21,      // … within n days → note only (the test decides, paces.md §3.3)
}

export interface FeedbackRun extends DatedRun { rpe: number | null; feel: Feel | null; pain: Pain | null }

// The weekly feedback as 07-26 stores it (settings 'week_feedback'); read-only here.
export interface WeekFeedbackEntry { rating: Feel; fatigue: Feel; note?: string; at: string }
export interface FeedbackInput { runs: FeedbackRun[]; week?: (WeekFeedbackEntry & { start: string }) | null }

export function storedWeekFeedback(raw: unknown): Record<string, WeekFeedbackEntry> {
  const by = raw && typeof raw === 'object' ? (raw as { byWeek?: unknown }).byWeek : null
  if (!by || typeof by !== 'object') return {}
  const out: Record<string, WeekFeedbackEntry> = {}
  for (const [start, e] of Object.entries(by as Record<string, Partial<WeekFeedbackEntry> | null>)) {
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !isFeel(e.rating) || !isFeel(e.fatigue) || typeof e.at !== 'string') continue
    out[start] = { rating: e.rating, fatigue: e.fatigue, at: e.at, ...(typeof e.note === 'string' && e.note.trim() ? { note: e.note.trim() } : {}) }
  }
  return out
}

// The week entry the rules read: this week's (rated early, e.g. on Sunday evening), else last week's.
export function weekEntryFor(byWeek: Record<string, WeekFeedbackEntry>, today: string): (WeekFeedbackEntry & { start: string }) | null {
  const monday = format(startOfWeek(parseISO(today), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const last = format(addDays(parseISO(monday), -7), 'yyyy-MM-dd')
  const start = byWeek[monday] ? monday : byWeek[last] ? last : null
  return start ? { start, ...byWeek[start] } : null
}

export type FeedbackSignal =
  | { kind: 'easy-too-hard'; dates: string[]; weekTired: boolean; why: string[] }
  | { kind: 'pain-stop'; date: string; why: string[] }
  | { kind: 'pain-recurring'; dates: string[]; why: string[] }
  | { kind: 'goal-pace-easy'; dates: string[]; why: string[] }

const day = (d: string, n: number) => format(addDays(parseISO(d), n), 'yyyy-MM-dd')
const R = FEEDBACK_RULES

// The session a run stood in for (swap-aware, like the Heute card), else the session of its day.
function sessionOf(run: DatedRun, sessions: PlanSession[], runs: DatedRun[]): PlanSession | undefined {
  const around = sessions.filter((s) => s.date >= day(run.date, -1) && s.date <= day(run.date, 1) && s.type !== 'rest')
  const paired = [...matchSessionRuns(around, runs.filter((r) => r.date >= day(run.date, -2) && r.date <= day(run.date, 2)))]
    .find(([, r]) => r?.id === run.id)?.[0]
  return paired ? around.find((s) => s.date === paired) : sessions.find((s) => s.date === run.date)
}

// A run on a free or rest day is an easy run too.
const isEasyDay = (s?: PlanSession) => !s || s.type === 'rest' || s.type === 'easy' || s.type === 'recovery' || (s.type === 'long' && !s.pace)

// Easy day rated too hard: RPE ≥ 6 (long run ≥ 7) or Gefühl ≤ 2. A run on a free day counts as an easy day.
export function tooHard(run: FeedbackRun, session?: PlanSession) {
  if (!isEasyDay(session)) return false
  const limit = session?.type === 'long' ? R.longRpeHigh : R.easyRpeHigh
  return (run.rpe != null && run.rpe >= limit) || (run.feel != null && run.feel <= R.easyFeelLow)
}

const pauseNow = (today: string, p?: PauseInput) => !!p?.pauses.some((x) => x.from <= today && today <= pauseEnd(x, p.today))
const list = (dates: string[]) => dates.map(dayLabel).join(', ')

export function feedbackSignals({ today, sessions, feedback, pauses }: {
  today: string; sessions: PlanSession[]; feedback?: FeedbackInput | null; pauses?: PauseInput
}): FeedbackSignal[] {
  if (!feedback) return []
  const runs = [...feedback.runs].filter((r) => r.date <= today).sort((a, b) => a.date.localeCompare(b.date))
  const out: FeedbackSignal[] = []

  // 1 · Easy runs too hard (+ the weekly feedback as one signal) → the workshop offers to soften the next hard session.
  const from = day(today, -(R.windowDays - 1))
  const flagged = runs.filter((r) => r.date >= from && tooHard(r, sessionOf(r, sessions, runs))).map((r) => r.date)
  const weekTired = (feedback.week?.fatigue ?? 0) >= R.weekFatigueHigh
  if (flagged.length + (weekTired ? 1 : 0) >= R.signalsNeeded && flagged.length > 0) {
    out.push({ kind: 'easy-too-hard', dates: flagged, weekTired, why: [
      `${flagged.length === 1 ? 'Ein lockerer Lauf' : `${flagged.length} lockere Läufe`} in 7 Tagen zu anstrengend (RPE ≥ ${R.easyRpeHigh}, Longrun ≥ ${R.longRpeHigh}, oder Gefühl ≤ ${R.easyFeelLow}): ${list(flagged)}.`,
      ...(weekTired ? [`Wochenfeedback: Müdigkeit ${feedback.week!.fatigue}/5.`] : []),
    ] })
  }

  // 2 · Pain: 'stop' on the latest run → Pause hint (unless a pause already covers today); light pain recurring → watch.
  const latest = runs[runs.length - 1]
  if (latest && latest.pain === 'stop' && latest.date >= day(today, -(R.painStopDays - 1)) && !pauseNow(today, pauses)) {
    out.push({ kind: 'pain-stop', date: latest.date, why: [
      `Schmerzen beim letzten Lauf (${dayLabel(latest.date)}): besser Pause als durchlaufen. Trag Krank/Pause ein – Runmate plant den Wiedereinstieg.`,
    ] })
  }
  const light = runs.filter((r) => r.pain === 'light' && r.date >= day(today, -(R.painLightDays - 1))).map((r) => r.date)
  if (light.length >= R.painLightRuns) {
    out.push({ kind: 'pain-recurring', dates: light, why: [
      `Leichte Schmerzen bei ${light.length} Läufen in zwei Wochen (${list(light)}): beobachten. Wenn sie den Schritt verändern, beim nächsten Mal „Stopp“.`,
    ] })
  }

  // 3 · Race pace on target and easy (RPE ≤ 4) several times → a note; the goal changes only through tests.
  const easyAtGoal = runs.filter((r) => {
    if (r.rpe == null || r.rpe > R.goalPaceRpeLow || r.date < day(today, -(R.goalPaceDays - 1))) return false
    const s = sessionOf(r, sessions, runs)
    if (!s?.pace || s.type === 'race' || !isRacePaceWork(paceToS(s.pace), raceOf(s.date))) return false
    const v = checkPace(s, r).verdict
    return v === 'im Ziel' || v === 'zu schnell'
  }).map((r) => r.date)
  if (easyAtGoal.length >= R.goalPaceRuns) {
    out.push({ kind: 'goal-pace-easy', dates: easyAtGoal, why: [
      `Renntempo fühlt sich leicht an (${easyAtGoal.length} Einheiten im Ziel mit RPE ≤ ${R.goalPaceRpeLow}: ${list(easyAtGoal)}): gutes Zeichen. Das Tempo bleibt, der nächste Test entscheidet.`,
    ] })
  }
  return out
}

// What the cards show as plain hints: every signal except 'easy-too-hard' (that one becomes a suggestion with a diff).
export interface FeedbackHint { kind: FeedbackSignal['kind']; tone: 'warn' | 'ok'; text: string; pause?: boolean }

export function feedbackHints(signals: FeedbackSignal[]): FeedbackHint[] {
  return signals.filter((s) => s.kind !== 'easy-too-hard').map((s) => ({
    kind: s.kind, tone: s.kind === 'goal-pace-easy' ? 'ok' : 'warn', text: s.why.join(' '), ...(s.kind === 'pain-stop' ? { pause: true } : {}),
  }))
}
