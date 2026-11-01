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
import { EMPTY_ENGINE, runEngine, undoChange, type EngineState, type Fitness } from './engine'
import type { DatedRun } from './pace-check'
import { loadPauses } from './pause-store'

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

export async function runAndSaveEngine(today = todayLocal()): Promise<EngineState> {
  await ensureLiveBlocks()
  const [manual, state, { runs, fitness }, syncedThrough, pauses] = await Promise.all([loadOverrides(), loadEngineState(), loadRunsAndFitness(), loadSyncedThrough(), loadPauses()])
  const r = runEngine({ today, at: new Date().toISOString(), manual, state, runs, fitness, syncedThrough, pauses })
  if (r.added.length) await saveEngineState(r.state)
  return r.state
}

export async function undoAndSave(id: string): Promise<EngineState | { error: string }> {
  const r = undoChange(await loadEngineState(), id)
  if ('error' in r) return r
  await saveEngineState(r)
  return r
}
