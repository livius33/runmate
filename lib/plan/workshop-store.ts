// DB side of the Plan-Werkstatt and the training profile: inputs, apply, undo, log (settings 'plan_workshop_log').
import { localDate } from '@/lib/dates'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { timeZone } from '@/lib/dates'
import { getLinkToken } from '@/lib/links/tokens'
import { RUN_ACTIVITY_TYPES, toDatedRun } from '@/lib/analytics/run-view'
import { acwr, acwrSeries, fitnessSeries } from '@/lib/analytics/load'
import { allGoals, storedGoals } from '@/lib/season/goals'
import { activeBlock } from './blocks'
import { athlete } from '@/lib/athlete'
import { loadOverrides, loadPlan, saveOverrides } from './load'
import { runAndSaveEngine } from './engine-store'
import { isHard } from './effective'
import {
  applyChanges, periodFor, recentVolume, reviewPeriod, suggestions, undoEntry, workshopHints,
  type PeriodChoice, type WorkshopEvent, type WorkshopLogEntry,
} from './workshop'
import { isoDay, validProfile, type AthleteProfile, type Weekday } from './athlete-profile'
import { loadPauses } from './pause-store'
import { loadRunFeedback } from '@/lib/feedback/run-store'
import { loadWeekFeedback } from '@/lib/feedback/week-reader'
import { weekEntryFor, type FeedbackInput } from '@/lib/feedback/rules'

const LOG_KEY = 'plan_workshop_log'
const PROFILE_KEY = 'athlete_profile'
const LOG_MAX = 50

const getSetting = getSettingJson
const setSetting = setSettingJson

export const loadProfile = () => getSetting<AthleteProfile>(PROFILE_KEY)
export async function saveProfile(p: AthleteProfile) {
  if (!validProfile(p)) throw new Error('Profil unvollständig')
  await setSetting(PROFILE_KEY, { ...p, savedAt: new Date().toISOString() })
}

// Events the period can run up to: race and anchored plan days, plus the Saison page's own goals.
async function loadEvents(plan: { date: string; title: string; type: string; anchor?: boolean }[]): Promise<WorkshopEvent[]> {
  const own = storedGoals(await getSetting<unknown>('season_goals'))
  const goals = allGoals(own).map((g) => ({ date: g.date, name: g.name }))
  const fromPlan = plan.filter((s) => s.type === 'race' || s.anchor).map((s) => ({ date: s.date, name: s.title }))
  const byDate = new Map<string, WorkshopEvent>()
  for (const e of [...goals, ...fromPlan]) if (!byDate.has(e.date)) byDate.set(e.date, e)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

async function loadInputs(today: string) {
  const [plan, manual, rows, profile, fb, weeks] = await Promise.all([loadPlan(), loadOverrides(), db.select().from(activities).where(own(activities)), loadProfile(), loadRunFeedback(), loadWeekFeedback()])
  const runRows = rows.filter((r) => RUN_ACTIVITY_TYPES.includes(r.type))
  // Feedback (07-25): RPE from the row, Gefühl/Schmerzen from settings 'run_feedback', the week entry from 07-26's 'week_feedback'.
  const feedback: FeedbackInput = {
    runs: runRows.map((r) => ({ ...toDatedRun(r), rpe: r.perceivedExertion ?? null, feel: fb.byActivity[r.id]?.feel ?? null, pain: fb.byActivity[r.id]?.pain ?? null })),
    week: weekEntryFor(weeks, today),
  }
  const actual = new Map<string, number>()
  for (const r of runRows) actual.set(r.date, Math.round(((actual.get(r.date) ?? 0) + r.distanceM / 1000) * 10) / 10)
  const now = localDate()        // the runner's day, like the fitness and stats routes (07-20)
  const series = fitnessSeries(rows, now)
  const ratio = acwr(runRows, now).acwr
  const fitness = { tsb: series.length ? series[series.length - 1].tsb : null, acwr: ratio > 0 ? ratio : null, acwrRecent: acwrSeries(runRows, now) }
  const events = await loadEvents(plan)
  return { plan, manual, actual, fitness, events, profile, runRows, feedback }
}

export async function workshop(choice: PeriodChoice, today: string) {
  const { plan, manual, actual, fitness, events, profile, feedback } = await loadInputs(today)
  const period = periodFor(choice, today, events)
  const recent = recentVolume(today, plan, actual)
  const input = { today, period, sessions: plan, manual, actual, fitness, events, profile, recent, pauses: { pauses: await loadPauses(), today }, feedback }
  const log = (await getSetting<WorkshopLogEntry[]>(LOG_KEY)) ?? []
  return { period, events: events.filter((e) => e.date >= today).slice(0, 8), review: reviewPeriod(period, today, plan, actual, fitness, recent),
    suggestions: suggestions(input), hints: workshopHints(input), log: log.slice(0, 15), profile, input }
}

// The suggestion is recomputed on the server, so only what the rules propose right now can be applied.
export async function applySuggestion(choice: PeriodChoice, id: string, today: string) {
  const w = await workshop(choice, today)
  const s = w.suggestions.find((x) => x.id === id)
  if (!s) return { error: 'Vorschlag gilt nicht mehr (Plan oder Läufe haben sich geändert). Bitte neu laden.' }
  const { manual, entry } = applyChanges(w.input.manual, s, w.period, new Date().toISOString())
  await saveOverrides(manual)
  const log = (await getSetting<WorkshopLogEntry[]>(LOG_KEY)) ?? []
  await setSetting(LOG_KEY, [entry, ...log].slice(0, LOG_MAX))
  await runAndSaveEngine(today)   // engine takes back its own additions on days that are now the runner's edits
  return { entry }
}

export async function undoWorkshop(entryId: string, today: string) {
  const log = (await getSetting<WorkshopLogEntry[]>(LOG_KEY)) ?? []
  const e = log.find((x) => x.id === entryId)
  if (!e || e.undoneAt) return { error: 'Änderung nicht gefunden oder schon rückgängig gemacht.' }
  const { manual, changedSince } = undoEntry(await loadOverrides(), e)
  await saveOverrides(manual)
  await setSetting(LOG_KEY, log.map((x) => (x.id === entryId ? { ...x, undoneAt: new Date().toISOString() } : x)))
  await runAndSaveEngine(today)
  return { changedSince }
}

// ─── Profile prefill from Runmate's data ─────────────────────────────────────

const mostCommon = (days: Weekday[], n: number) => {
  const c = new Map<Weekday, number>()
  for (const d of days) c.set(d, (c.get(d) ?? 0) + 1)
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, n).map(([d]) => d).sort()
}

// Threshold pace from race pace (research paces.md: threshold ≈ 1-h race pace; marathon pace ≈ threshold + 15 s/km,
// HM pace ≈ threshold − 5…10, 10 km ≈ threshold − 15; convention). Prefill only — the profile form shows it.
const THRESHOLD_FROM_RACE_S = (d: number) => (d > 30 ? -15 : d > 15 ? 8 : 15)

export async function profilePrefill(today: string): Promise<AthleteProfile> {
  const { plan, runRows } = await loadInputs(today)
  const from = new Date(`${today}T12:00:00Z`); from.setUTCDate(from.getUTCDate() - 28)
  const since = from.toISOString().slice(0, 10)
  const km4 = runRows.filter((r) => r.date >= since && r.date < today).reduce((t, r) => t + r.distanceM / 1000, 0)
  const race = activeBlock(today).race
  // Habits from the last 12 weeks of the plan (07-20: no longer a fixed start date).
  const from12 = new Date(`${today}T12:00:00Z`); from12.setUTCDate(from12.getUTCDate() - 84)
  const recent = plan.filter((s) => s.date >= from12.toISOString().slice(0, 10) && s.date < race.date)
  const longDays = recent.filter((s) => s.type === 'long').map((s) => isoDay(s.date))
  const hardDays = recent.filter((s) => isHard(s) && s.type !== 'long' && s.type !== 'race').map((s) => isoDay(s.date))
  const restDays = recent.filter((s) => s.type === 'rest').map((s) => isoDay(s.date))
  const longRunDay = mostCommon(longDays, 1)[0] ?? 6
  const weekdayMax = Math.max(0, ...recent.filter((s) => isoDay(s.date) <= 5 && s.type !== 'race').map((s) => s.km ?? 0))
  const weekendMax = Math.max(0, ...recent.filter((s) => isoDay(s.date) >= 6 && s.type !== 'race').map((s) => s.km ?? 0))
  return {
    v: 1, age: null, weightKg: athlete().weightKg, heightCm: null,
    experience: 'advanced', weeklyKm: Math.round(km4 / 4),
    availableDays: [1, 2, 3, 4, 5, 6, 7],
    longRunDay, qualityDays: mostCommon(hardDays.filter((d) => d !== longRunDay), 2), kbDays: [2, 4],
    restDay: mostCommon(restDays.filter((d) => d !== longRunDay), 1)[0] ?? 5,
    maxKmWeekday: weekdayMax ? Math.ceil(weekdayMax) : null, maxKmWeekend: weekendMax ? Math.ceil(weekendMax) : null,
    fitnessMethod: 'threshold', thresholdPaceS: race.goalPaceS + THRESHOLD_FROM_RACE_S(race.distanceKm), fiveKS: null, savedAt: null,
  }
}

// For the onboarding's "Verbindungen" step.
export async function connections() {
  const [sync, cal, health] = await Promise.all([getSetting<{ at: string; error?: string }>('garmin_last_sync'), getLinkToken('calendar'), getLinkToken('health')])
  const at = sync && !sync.error ? new Date(sync.at) : null
  return {
    garminSync: at ? at.toLocaleString('de-DE', { timeZone: timeZone(), day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
    calendar: cal != null, appleHealth: health != null,
  }
}

export async function upcomingEvents(today: string) {
  return (await loadEvents(await loadPlan())).filter((e) => e.date >= today).slice(0, 8)
}
