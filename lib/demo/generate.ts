// The demo instance's data (Phase 5): a fictional runner 8 weeks into a 12-week "Hamburg HM" block, generated from the
// app's own pieces — the block by the plan generator (generateDraft + freezeDraft), every morning the plan engine on
// what was "synced" up to yesterday, every day a run of the effective session (lib/demo/runs.ts). Scripted on top:
// week 3 a key session is missed, week 5 four days Krank (the graded return follows from the pause rules), week 7 too
// much too soon after it (the fatigue guard steps in), strength and bike sessions, run feedback and two week ratings.
//
// Deterministic: the same `today` gives byte-identical data (fixed seed, fixed timestamps). Pure apart from one thing:
// the generated block is registered in the current scope (the engine and the pause rules look blocks up there), so
// the caller runs it as the demo user — scripts/seed-demo.mts with the process scope, the reset cron in runAsUser.
// Server/scripts only (reads the methodology files).
import { addDays, differenceInCalendarDays, format, getISODay, parseISO, startOfWeek } from 'date-fns'
import { currentScope } from '@/lib/scope'
import { blocks, registerLiveBlocks } from '@/lib/plan/blocks'
import { effectiveSessions } from '@/lib/plan/effective'
import { EMPTY_ENGINE, runEngine, type EngineState, type Fitness } from '@/lib/plan/engine'
import { paceToS } from '@/lib/plan/format'
import type { Pause } from '@/lib/plan/pause'
import type { DatedRun } from '@/lib/plan/pace-check'
import type { PlanSession, TrainingBlock } from '@/lib/plan/types'
import { listMethodologies } from '@/lib/plan/methodology/load'
import { measureInputs } from '@/lib/plan/generator/inputs'
import { generateDraft } from '@/lib/plan/generator/draft'
import { freezeDraft } from '@/lib/plan/generator/freeze'
import { acwr, acwrSeries, fitnessSeries } from '@/lib/analytics/load'
import { RUN_ACTIVITY_TYPES, toDatedRun } from '@/lib/analytics/run-view'
import type { UserProfile } from '@/lib/profile'
import type { RunFeedbackStore } from '@/lib/feedback/run'
import type { WeekFeedback } from '@/lib/feedback/week'
import type { StoredLive } from '@/lib/plan/live-blocks'
import type { StoredSeason } from '@/lib/season/goals'
import type { AthleteProfile } from '@/lib/plan/athlete-profile'
import {
  DEMO_ATHLETE, DEMO_PEAK_KM, DEMO_PROFILE, DEMO_SEED, DEMO_TEMPLATE, DEMO_TODAY_WEEK, DEMO_USER_ID, DEMO_WEEKS, demoGoal,
} from './athlete'
import { NORMAL, between, crossSession, historyRun, makeRun, rng, type Behaviour, type DemoActivity, type DemoStreams } from './runs'

export interface DemoData {
  today: string
  profile: UserProfile
  settings: Record<string, unknown>     // settings key → JSON value
  activities: DemoActivity[]
  streams: DemoStreams[]
  block: TrainingBlock
  story: { missedKey: string; krank: { from: string; to: string }; overdoWeek: string }   // for tests and the README
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')
const plus = (d: string, n: number) => ymd(addDays(parseISO(d), n))
const monday = (d: string) => ymd(startOfWeek(parseISO(d), { weekStartsOn: 1 }))
const iso = (d: string, hhmm: string) => `${d}T${hhmm}:00.000Z`

const HISTORY_WEEKS = 8
const KRANK_WEEK = 5, KRANK_DAYS = [2, 3, 4, 5]          // Di–Fr of block week 5 (ISO weekdays)
const MISSED_WEEK = 3
const OVERDO_WEEK = 7
const OVERDO: Behaviour = { kmFactor: 1.15, paceDelta: -15, effortDelta: 0.05 }
const STRENGTH_WEEKS = [1, 2, 3, 4, 6, 8, 9]
const RIDE_WEEKS = [2, 6]

// The demo block from the plan generator, for the race on the Sunday of week 12.
function demoBlock(planStart: string, history: DemoActivity[]): TrainingBlock {
  const race = plus(planStart, DEMO_WEEKS * 7 - 1)
  const m = listMethodologies().valid.find((x) => x.id === DEMO_TEMPLATE)
  if (!m) throw new Error(`Demo: Vorlage ${DEMO_TEMPLATE} fehlt`)
  const goal = demoGoal(race)
  const measured = measureInputs({ runs: history, plan: [], weeks: [], today: plus(planStart, -3), start: planStart, distance: 'half' })
  const d = generateDraft({ goal, template: m.params, start: planStart, profile: DEMO_ATHLETE, measured, overrides: { peakKm: DEMO_PEAK_KM } })
  if (!d.ok) throw new Error(`Demo: Entwurf fehlgeschlagen (${d.error})`)
  return freezeDraft(d, goal, m.meta.name, m.params)
}

export function generateDemo(today: string): DemoData {
  if (currentScope().userId !== DEMO_USER_ID) throw new Error('generateDemo runs only in the demo user\'s scope')
  const rand = rng(DEMO_SEED)
  const tz = DEMO_PROFILE.timezone!
  const easyS = paceToS(DEMO_PROFILE.easyPace!)
  const planStart = plus(monday(today), -7 * (DEMO_TODAY_WEEK - 1))
  const weekStart = (w: number) => plus(planStart, 7 * (w - 1))
  const weekOfDay = (d: string) => Math.floor(differenceInCalendarDays(parseISO(d), parseISO(planStart)) / 7) + 1

  // History: 8 weeks of easy running, Friday off, a longer Sunday run.
  const activities: DemoActivity[] = []
  for (let i = HISTORY_WEEKS * 7; i >= 1; i--) {
    const d = plus(planStart, -i)
    const wd = getISODay(parseISO(d))
    if (wd === 5 || (wd === 3 && rand() < 0.4)) continue
    const km = wd === 7 ? 14 + Math.round(between(rand, 0, 3)) : 7 + Math.round(between(rand, 0, 3))
    activities.push(historyRun(`demo-${d}-h`, d, km, easyS, tz, rand, wd === 2))
  }

  const block = demoBlock(planStart, activities)
  registerLiveBlocks([block])
  if (!blocks().some((b) => b.id === block.id)) throw new Error('Demo: Block überschneidet sich mit einer Plan-Datei')

  const streams: DemoStreams[] = []
  const krank = { from: plus(weekStart(KRANK_WEEK), KRANK_DAYS[0] - 1), to: plus(weekStart(KRANK_WEEK), KRANK_DAYS[KRANK_DAYS.length - 1] - 1) }
  const pausesOn = (d: string): Pause[] => (d < krank.from ? [] : [{ id: 'demo-krank', kind: 'krank', from: krank.from, to: d > krank.to ? krank.to : null }])
  let state: EngineState = EMPTY_ENGINE
  let missedKey = ''
  const feedback: RunFeedbackStore = { v: 1, byActivity: {} }

  const morning = (d: string): { runs: DatedRun[]; fitness: Fitness } => {
    const rows = activities.filter((a) => a.date < d) as Parameters<typeof toDatedRun>[0][]
    const runRows = rows.filter((r) => RUN_ACTIVITY_TYPES.includes(r.type))
    const now = parseISO(d)
    const series = fitnessSeries(rows, now)
    const ratio = acwr(runRows, now).acwr
    const fitness: Fitness = { tsb: series.length ? series[series.length - 1].tsb : null, acwr: ratio > 0 ? ratio : null, acwrRecent: acwrSeries(runRows, now) }
    const runs = runRows.filter((r) => r.date >= planStart).map((r) => {
      const v = toDatedRun({ ...r, userId: DEMO_USER_ID })
      return { id: v.id, date: v.date, km: v.km, paceS: v.paceS, avgHr: v.avgHr, splitPacesS: v.splitPacesS, splitHrs: v.splitHrs }
    })
    return { runs, fitness }
  }

  for (let d = planStart; d <= today; d = plus(d, 1)) {
    // Morning: the engine on yesterday's data, as the app runs it when the Plan page opens.
    const pauses = pausesOn(d)
    const { runs, fitness } = morning(d)
    state = runEngine({ today: d, at: iso(d, '05:30'), manual: {}, state, runs, fitness, syncedThrough: plus(d, -1), pauses }).state
    if (d === today) break

    const w = weekOfDay(d)
    const wd = getISODay(parseISO(d))
    const s = effectiveSessions({}, state.overrides, { pauses, today: d }).find((x) => x.date === d)
    if (w === STRENGTH_WEEKS.find((x) => x === w) && wd === 3) {
      activities.push(crossSession(`manual-demo-${d}-kraft`, d, 'Strength', 35 + Math.round(between(rand, 0, 10)), 6, 'Kraft: Rumpf und Beine'))
    }
    if (RIDE_WEEKS.includes(w) && wd === 6) activities.push(crossSession(`manual-demo-${d}-rad`, d, 'Ride', 60, 4, 'Rad: locker an der Elbe'))
    if (!s || s.type === 'rest' || s.type === 'race' || !(s.km ?? 0) || s.paused) {
      // Too much too soon: an extra run on the rest day of the overdo week.
      if (w === OVERDO_WEEK && s?.type === 'rest') addRun(d, { date: d, type: 'easy', km: 8, title: 'Locker (extra)' }, 8, OVERDO)
      continue
    }
    // A busy stretch: the week's second key session falls out, the runs around it stay short (so none of them stands
    // in for it, lib/plan/engine.ts wasRun), and the engine catches it up.
    if (w === MISSED_WEEK && s.key && wd >= 4 && !missedKey) { missedKey = d; continue }
    const busy = !!missedKey && d > missedKey && d <= plus(missedKey, 2) && !s.key
    addRun(d, s, s.km! * (busy ? 0.6 : 1), w === OVERDO_WEEK ? OVERDO : NORMAL)
  }

  function addRun(d: string, s: PlanSession, km: number, b: Behaviour) {
    const id = `demo-${d}`
    const quality = s.type === 'tempo' || s.type === 'intervals' || s.type === 'long'
    const rpe = quality ? Math.min(10, Math.round((s.type === 'long' ? 6 : 7) + b.effortDelta * 20 + between(rand, 0, 1))) : null
    const run = makeRun({ id, date: d, session: s, km, easyPaceS: easyS, timeZone: tz, behaviour: b, rand, rpe })
    activities.push(run.activity)
    streams.push(run.streams)
    const w = weekOfDay(d)
    if (w === OVERDO_WEEK && s.type === 'long') feedback.byActivity[id] = { feel: 2, pain: 'light', note: 'Beine schwer, Wade links zieht leicht.', at: iso(d, '19:00') }
    else if (w === 2 && s.type === 'long') feedback.byActivity[id] = { feel: 4, pain: 'none', note: 'Locker an der Alster, gutes Gefühl.', at: iso(d, '19:00') }
    else if (w === 6 && s.key) feedback.byActivity[id] = { feel: 3, pain: 'none', note: 'Erste Einheit nach der Erkältung, noch etwas schlapp.', at: iso(d, '19:00') }
  }

  const weekFeedback: WeekFeedback = { v: 1, byWeek: {
    [weekStart(OVERDO_WEEK)]: { rating: 3, fatigue: 4, note: 'Nach der Erkältung zu viel gewollt – der Plan hat gebremst.', at: iso(plus(weekStart(OVERDO_WEEK), 6), '20:00') },
    [weekStart(DEMO_TODAY_WEEK - 1)]: { rating: 4, fatigue: 2, note: 'Wieder im Rhythmus.', at: iso(plus(weekStart(DEMO_TODAY_WEEK - 1), 6), '20:00') },
  } }
  const athlete: AthleteProfile = { ...DEMO_ATHLETE, savedAt: iso(plus(planStart, -7), '18:00') }
  const created = iso(plus(planStart, -10), '18:00')
  const settings: Record<string, unknown> = {
    season_goals: { v: 2, goals: [demoGoal(block.race.date)] } satisfies StoredSeason,
    plan_blocks: { v: 1, blocks: [{ block, draftId: 'demo-draft', liveAt: iso(plus(planStart, -7), '18:05') }] } satisfies StoredLive,
    plan_drafts: { v: 1, drafts: [{ id: 'demo-draft', goalId: block.goalId, templateId: DEMO_TEMPLATE, start: planStart, overrides: { peakKm: DEMO_PEAK_KM }, createdAt: created, updatedAt: created }] },
    athlete_profile: athlete,
    plan_engine: state,
    plan_pauses: [{ id: 'demo-krank', kind: 'krank', from: krank.from, to: krank.to }] satisfies Pause[],
    run_feedback: feedback,
    week_feedback: weekFeedback,
  }
  activities.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  return { today, profile: DEMO_PROFILE, settings, activities, streams, block, story: { missedKey, krank, overdoWeek: weekStart(OVERDO_WEEK) } }
}
