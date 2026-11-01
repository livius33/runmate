import { db } from '@/lib/db'
import { trainingPlan } from '@/lib/db/schema'
import { own } from '@/lib/db/owned'
import { getSettingJson, setSettingJson } from '@/lib/db/settings'
import { firstPlanStart } from './blocks'
import { type PlanSession } from './types'
import { effectiveSessions, type Overrides } from './effective'
import { ensureLiveBlocks } from './live-blocks'
import { loadPauses } from './pause-store'
import { todayLocal } from '@/lib/dates'

const OVERRIDES_KEY = 'plan_overrides'
const ENGINE_KEY = 'plan_engine'   // engine state, see engine-store.ts

export async function loadOverrides(): Promise<Overrides> {
  return (await getSettingJson<Overrides>(OVERRIDES_KEY)) ?? {}
}

export async function saveOverrides(overrides: Overrides) {
  await setSettingJson(OVERRIDES_KEY, overrides)
}

// Sessions before the first block come from the plan stored in the DB (history);
// from there on, the training blocks (lib/plan/blocks.ts) plus engine changes plus the edits made on the home page,
// with Krank/Pause periods on top (lib/plan/pause.ts).
export async function loadPlan(): Promise<PlanSession[]> {
  await ensureLiveBlocks()
  const [[row], overrides, engine, pauses] = await Promise.all([
    db.select().from(trainingPlan).where(own(trainingPlan)),
    loadOverrides(),
    getSettingJson<{ overrides?: Overrides }>(ENGINE_KEY),
    loadPauses(),
  ])
  let stored: PlanSession[] = []
  if (row) {
    try { stored = JSON.parse(row.planJson) } catch { /* ignore */ }
  }
  let engineOverrides: Overrides = {}
  engineOverrides = engine?.overrides ?? {}
  return [...stored.filter((s) => s.date < firstPlanStart()), ...effectiveSessions(overrides, engineOverrides, { pauses, today: todayLocal() })]
}
