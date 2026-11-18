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
import { EMPTY_ENGINE, runEngine, undoChange, type EngineChange, type EngineInput, type EngineState, type Fitness } from './engine'
import type { DatedRun } from './pace-check'
import { loadPauses } from './pause-store'
import { loadRecoveryToday } from '@/lib/wellness/store'
import { hasFeature } from '@/lib/billing/access'

const ENGINE_KEY = 'plan_engine'

export async function loadEngineState(): Promise<EngineState> {
  const v = await getSettingJson<Partial<EngineState>>(ENGINE_KEY)
  return v ? { ...EMPTY_ENGINE, ...v } : EMPTY_ENGINE
}

export async function saveEngineState(state: EngineState) {
  await setSettingJson(ENGINE_KEY, state)
}

import { todayLocal, localDate } from '@/lib/dates'
import { ensureLiveBlocks } from './live-blocks'
import { pullSources } from '@/lib/sources/registry'
import { loadLastSync } from '@/lib/sources/sync'

// Runs of the plan window plus today's form (TSB) and load ratio (ACWR), from the shared model; and the date of the
// newest stored run of any time (loadSyncedThrough).
async function loadRunsAndFitness(): Promise<{ runs: DatedRun[]; fitness: Fitness; newestRun: string | null }> {
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
  const newestRun = runRows.reduce<string | null>((m, r) => (m == null || r.date > m ? r.date : m), null)
  return { runs, fitness, newestRun }
}

// Last day the stored data fully covers: the later of two days, null when there is neither (nothing counts as missed).
// (a) The day before the latest successful sync of a pull source (the runner's date). The sync saves its result per
//     source; a source whose last sync failed covers nothing.
// (b) The date of the newest stored run (`newestRun`, the runner's date like every run the engine sees). Runs from a
//     file import or the Apple Health Shortcut leave no sync record: a run on day D shows that the runner's data
//     reached us up to D, so earlier days without a run were really missed. An import of old history ends at its last
//     run and says nothing about the weeks after it.
export async function loadSyncedThrough(newestRun: string | null): Promise<string | null> {
  const syncs = await Promise.all(pullSources().map((src) => loadLastSync(src.meta.id)))
  const at = syncs.flatMap((s) => (s && !s.error && typeof s.at === 'string' && !Number.isNaN(Date.parse(s.at)) ? [s.at] : [])).sort().at(-1)
  const synced = at ? format(addDays(parseISO(todayLocal(new Date(at))), -1), 'yyyy-MM-dd') : null
  return synced && newestRun ? (synced > newestRun ? synced : newestRun) : synced ?? newestRun
}

// The engine's state plus, without Plus (lib/billing/entitlements.ts autoAdapt), the changes it would make now.
export interface EngineResult extends EngineState { suggestions?: EngineChange[] }

// This morning's night flags for the plan (engine and Werkstatt): only with recoveryInPlan (Plus, trial, self-host;
// lib/billing/entitlements.ts). The recovery card and the Heute hint read the nights themselves and stay free.
export async function loadRecoveryForPlan(today: string) {
  return (await hasFeature('recoveryInPlan')) ? loadRecoveryToday(today) : undefined
}

async function runNow(today: string) {
  await ensureLiveBlocks()
  // The coverage needs the newest run: it follows the runs instead of asking the database for them a second time.
  const data = loadRunsAndFitness()
  const [manual, state, { runs, fitness: load }, syncedThrough, pauses, recovery] = await Promise.all([
    loadOverrides(), loadEngineState(), data, data.then((d) => loadSyncedThrough(d.newestRun)), loadPauses(), loadRecoveryForPlan(today)])
  // This morning's night flags join the fitness; without wellness data (or without Plus) nothing changes.
  const fitness: Fitness = recovery ? { ...load, recovery } : load
  const input: EngineInput = { today, at: new Date().toISOString(), manual, state, runs, fitness, syncedThrough, pauses }
  return { input, r: runEngine(input) }
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

// One suggestion as it applies on its own. Later rules build on the earlier changes of the same run (the heart-rate note
// copies a day that rebalance has just raised), so the change is computed again with the run's other suggestions held
// back: taking over one suggestion never brings in the km of another.
export function suggestionAlone(input: EngineInput, saved: EngineState, suggestions: EngineChange[], key: string): EngineChange | undefined {
  const held = suggestions.filter((x) => x.key !== key).map((x) => x.vetoKey ?? x.key)
  return runEngine({ ...input, state: { ...saved, vetoes: [...saved.vetoes, ...held] } }).added.find((x) => x.key === key && isSuggestion(x))
}

export async function acceptSuggestion(key: string, decline = false, today = todayLocal()): Promise<EngineResult | { error: string }> {
  const { input, r } = await runNow(today)
  const { state, suggestions } = withoutSuggestions(r.state, r.added)
  const shown = suggestions.find((x) => x.key === key)
  const c = shown && (decline ? shown : suggestionAlone(input, state, suggestions, key))
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
