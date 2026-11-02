// Loads and saves the plan engine's state (settings key 'plan_engine') and runs it against the
// current plan, manual edits and synced runs.
import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { RUN_ACTIVITY_TYPES, parseMetrics } from '@/lib/analytics/run-view'
import { acwr, acwrSeries, fitnessSeries } from '@/lib/analytics/load'
import { firstPlanStart } from './blocks'
import { loadOverrides } from './load'
import { EMPTY_ENGINE, runEngine, undoChange, type EngineChange, type EngineState, type Fitness } from './engine'
import type { DatedRun } from './pace-check'
import { loadPauses } from './pause-store'
import { hasFeature } from '@/lib/billing/access'

const ENGINE_KEY = 'plan_engine'

export async function loadEngineState(): Promise<EngineState> {
  const v = await getSettingJson<Partial<EngineState>>(ENGINE_KEY)
  return v ? { ...EMPTY_ENGINE, ...v } : EMPTY_ENGINE
}

async function saveEngineState(state: EngineState) {
  await setSettingJson(ENGINE_KEY, state)
}

import { todayLocal, localDate } from '@/lib/dates'
import { ensureLiveBlocks } from './live-blocks'

// Runs of the plan window plus today's form (TSB) and load ratio (ACWR), from the shared model.
async function loadRunsAndFitness(): Promise<{ runs: DatedRun[]; fitness: Fitness }> {
  const rows = await db.select().from(activities).where(own(activities))
  const now = localDate()        // the runner's day, like the fitness and stats routes (07-20)
  const series = fitnessSeries(rows, now)
  const runRows = rows.filter((r) => RUN_ACTIVITY_TYPES.includes(r.type))
  const ratio = acwr(runRows, now).acwr
  const fitness: Fitness = { tsb: series.length ? series[series.length - 1].tsb : null, acwr: ratio > 0 ? ratio : null, acwrRecent: acwrSeries(runRows, now) }
  const runs = runRows.filter((r) => r.date >= firstPlanStart()).map((r) => {
    const full = (parseMetrics(r)?.splits ?? []).filter((s) => s.distM >= 950)
    return {
      id: r.id,
      date: r.date,
      km: Math.round(r.distanceM / 100) / 10,
      paceS: r.averagePaceSPerKm,
      avgHr: r.averageHr,
      splitPacesS: full.map((s) => s.paceS),
      splitHrs: full.map((s) => s.hr),
    }
  })
  return { runs, fitness }
}

// Last day fully covered by the latest successful sync: the day before the sync (the runner's date).
// A failed sync covers nothing new. No sync record → null (nothing counts as missed).
async function loadSyncedThrough(): Promise<string | null> {
  const s = await getSettingJson<{ at: string; error?: string }>('garmin_last_sync')
  if (!s || s.error || typeof s.at !== 'string' || Number.isNaN(Date.parse(s.at))) return null
  return format(addDays(parseISO(todayLocal(new Date(s.at))), -1), 'yyyy-MM-dd')
}

// The engine's state plus, without Plus (lib/billing/entitlements.ts autoAdapt), the changes it would make now.
export interface EngineResult extends EngineState { suggestions?: EngineChange[] }

async function runNow(today: string) {
  await ensureLiveBlocks()
  const [manual, state, { runs, fitness }, syncedThrough, pauses] = await Promise.all([loadOverrides(), loadEngineState(), loadRunsAndFitness(), loadSyncedThrough(), loadPauses()])
  return { state, r: runEngine({ today, at: new Date().toISOString(), manual, state, runs, fitness, syncedThrough, pauses }) }
}

// The engine's new changes that alter the plan (not its notes and not its own corrections).
const isSuggestion = (c: EngineChange) => c.status === 'active' && Object.keys(c.after).length > 0

// The run's result without its new plan changes: those are reverted in reverse order (each change's `before` holds the
// engine overrides it replaced), everything else — corrections of earlier changes, notes — stays. The engine itself
// is unchanged; this only decides what is saved.
export function withoutSuggestions(state: EngineState, added: EngineChange[]): { state: EngineState; suggestions: EngineChange[] } {
  const suggestions = added.filter(isSuggestion)
  if (!suggestions.length) return { state, suggestions }
  const overrides = { ...state.overrides }
  for (const c of [...suggestions].reverse()) {
    for (const d of Object.keys(c.after)) {
      const prev = c.before[d]
      if (prev) overrides[d] = prev
      else delete overrides[d]
    }
  }
  const ids = new Set(suggestions.map((c) => c.id))
  return { state: { ...state, overrides, log: state.log.filter((c) => !ids.has(c.id)) }, suggestions }
}

// Plus (and self-host, trial): the engine applies its changes. Otherwise it saves only corrections and notes and
// returns the rest as suggestions the runner can take over one by one (acceptSuggestion).
export async function runAndSaveEngine(today = todayLocal()): Promise<EngineResult> {
  const { r } = await runNow(today)
  if (await hasFeature('autoAdapt')) {
    if (r.added.length) await saveEngineState(r.state)
    return r.state
  }
  const { state, suggestions } = withoutSuggestions(r.state, r.added)
  if (r.added.length > suggestions.length) await saveEngineState(state)
  return { ...state, suggestions }
}

// Take over (or decline) one suggestion by its key. Taking over applies exactly that change on top of what is saved
// (its `before` re-read from the saved state); declining vetoes it like an undo, so it is not suggested again.
export function applySuggestion(state: EngineState, c: EngineChange, decline = false): EngineState {
  if (decline) return { ...state, vetoes: [...new Set([...state.vetoes, c.vetoKey ?? c.key])] }
  const before = Object.fromEntries(Object.keys(c.after).map((d) => [d, state.overrides[d] ?? null]))
  return { ...state, overrides: { ...state.overrides, ...c.after }, log: [...state.log, { ...c, before }] }
}

export async function acceptSuggestion(key: string, decline = false, today = todayLocal()): Promise<EngineResult | { error: string }> {
  const { r } = await runNow(today)
  const { state, suggestions } = withoutSuggestions(r.state, r.added)
  const c = suggestions.find((x) => x.key === key)
  if (!c) return { error: 'Dieser Vorschlag gilt nicht mehr.' }
  const next = applySuggestion(state, c, decline)
  await saveEngineState(next)
  return { ...next, suggestions: suggestions.filter((x) => x.key !== key) }
}

export async function undoAndSave(id: string): Promise<EngineState | { error: string }> {
  const r = undoChange(await loadEngineState(), id)
  if ('error' in r) return r
  await saveEngineState(r)
  return r
}
