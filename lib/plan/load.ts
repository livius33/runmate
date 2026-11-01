import { db } from '@/lib/db'
import { settings, trainingPlan } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { firstPlanStart } from './blocks'
import { type PlanSession } from './types'
import { effectiveSessions, type Overrides } from './effective'
import { ensureLiveBlocks } from './live-blocks'
import { loadPauses } from './pause-store'
import { todayInHamburg } from '@/lib/dates'

const OVERRIDES_KEY = 'plan_overrides'
const ENGINE_KEY = 'plan_engine'   // engine state, see engine-store.ts

export async function loadOverrides(): Promise<Overrides> {
  const [row] = await db.select().from(settings).where(eq(settings.key, OVERRIDES_KEY))
  if (!row) return {}
  try { return JSON.parse(row.value) } catch { return {} }
}

export async function saveOverrides(overrides: Overrides) {
  const value = JSON.stringify(overrides)
  await db
    .insert(settings)
    .values({ key: OVERRIDES_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
}

// Sessions before the first block come from the plan stored in the DB (history);
// from there on, the training blocks (lib/plan/blocks.ts) plus engine changes plus the edits made on the home page,
// with Krank/Pause periods on top (lib/plan/pause.ts).
export async function loadPlan(): Promise<PlanSession[]> {
  await ensureLiveBlocks()
  const [[row], overrides, engine, pauses] = await Promise.all([
    db.select().from(trainingPlan).where(eq(trainingPlan.id, 1)),
    loadOverrides(),
    db.select().from(settings).where(eq(settings.key, ENGINE_KEY)),
    loadPauses(),
  ])
  let stored: PlanSession[] = []
  if (row) {
    try { stored = JSON.parse(row.planJson) } catch { /* ignore */ }
  }
  let engineOverrides: Overrides = {}
  try { engineOverrides = engine[0] ? JSON.parse(engine[0].value).overrides ?? {} : {} } catch { /* ignore */ }
  return [...stored.filter((s) => s.date < firstPlanStart()), ...effectiveSessions(overrides, engineOverrides, { pauses, today: todayInHamburg() })]
}
