// Live training blocks from settings 'plan_blocks' (07-14), registered into lib/plan/blocks.ts so every synchronous
// lookup sees them, with the minor races from the Saison page applied (07-16; never stored in the block). Server only
// (database). Read at most every 10 s per server instance.
import { and, eq, gte, inArray } from 'drizzle-orm'
import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/lib/db'
import { activities, settings } from '@/lib/db/schema'
import { SEASON_KEY, storedGoals, type SeasonGoal } from '@/lib/season/goals'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import { todayInHamburg } from '@/lib/dates'
import { builtInBlocks, registerLiveBlocks } from './blocks'
import { applyEvents } from './events'
import { validProfile } from './athlete-profile'
import { BASE_DEFAULTS, baseBlocks, type BaseSettings } from './base-block'
import type { TrainingBlock } from './types'

export const LIVE_BLOCKS_KEY = 'plan_blocks'
export const BASE_KEY = 'base_block'       // 07-17: BaseSettings { v, paused, capKm }
export interface LiveEntry { block: TrainingBlock; draftId: string; liveAt: string }
export interface StoredLive { v: 1; blocks: LiveEntry[] }

const TTL_MS = 10_000
let loadedAt = 0
let pending: Promise<TrainingBlock[]> | null = null

const parseLive = (value?: string): LiveEntry[] => {
  if (!value) return []
  try {
    const v = JSON.parse(value) as StoredLive
    return v?.v === 1 && Array.isArray(v.blocks) ? v.blocks : []
  } catch { return [] }
}
const parseGoals = (value?: string): SeasonGoal[] => {
  try { return storedGoals(value ? JSON.parse(value) : null) } catch { return storedGoals(null) }
}

// The stored blocks as frozen (draft-store writes these back; events are never part of them).
export async function readLiveEntries(): Promise<LiveEntry[]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, LIVE_BLOCKS_KEY))
  return parseLive(row?.value)
}

export const parseBase = (value?: string): BaseSettings => {
  try {
    const v = value ? JSON.parse(value) : null
    return v?.v === 1 ? { v: 1, paused: !!v.paused, capKm: typeof v.capKm === 'number' && v.capKm > 0 ? v.capKm : null } : BASE_DEFAULTS
  } catch { return BASE_DEFAULTS }
}

// Live blocks plus the rolling base blocks in the gaps between them (07-17), minor races applied to both.
async function readLiveBlocks(): Promise<TrainingBlock[]> {
  const today = todayInHamburg()
  const since = format(addDays(parseISO(today), -400), 'yyyy-MM-dd')
  const [rows, runRows] = await Promise.all([
    db.select().from(settings).where(inArray(settings.key, [LIVE_BLOCKS_KEY, SEASON_KEY, BASE_KEY, 'athlete_profile'])),
    db.select({ date: activities.date, distanceM: activities.distanceM, type: activities.type }).from(activities)
      .where(and(gte(activities.date, since), inArray(activities.type, [...RUN_ACTIVITY_TYPES]))),
  ])
  const value = (k: string) => rows.find((r) => r.key === k)?.value
  const goals = parseGoals(value(SEASON_KEY))
  const live = parseLive(value(LIVE_BLOCKS_KEY)).map((e) => e.block)
  let profile: unknown = null
  try { profile = JSON.parse(value('athlete_profile') ?? 'null') } catch { /* none */ }
  const runs = runRows.map((r) => ({ date: r.date, km: (r.distanceM ?? 0) / 1000 }))
  const base = baseBlocks({ blocks: [...builtInBlocks(), ...live], runs, today, profile: validProfile(profile) ? profile : null, settings: parseBase(value(BASE_KEY)) })
  return [...live, ...base].map((b) => applyEvents(b, goals))
}

// Registers the live blocks and returns them; `force` skips the cache (after going live or offline, after a Saison change).
export async function ensureLiveBlocks(force = false): Promise<TrainingBlock[]> {
  if (!force && Date.now() - loadedAt < TTL_MS && !pending) return currentLive
  pending ??= readLiveBlocks().then((blocks) => {
    currentLive = blocks
    registerLiveBlocks(currentLive)
    loadedAt = Date.now()
    return currentLive
  }).finally(() => { pending = null })
  return pending
}
let currentLive: TrainingBlock[] = []
