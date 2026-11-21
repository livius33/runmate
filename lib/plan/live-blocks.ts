// Live training blocks from settings 'plan_blocks' (07-14), registered into lib/plan/blocks.ts so every synchronous
// lookup sees them, with the minor races from the Saison page applied (07-16; never stored in the block). Server only
// (database). Per user: registered into the request's scope (lib/scope.ts); read at most every 10 s per user and
// server instance.
import type { DraftOverrides } from './generator/draft'
import { and, gte, inArray } from 'drizzle-orm'
import { addDays, format, parseISO } from 'date-fns'
import { db } from '@/lib/db'
import { activities } from '@/lib/db/schema'
import { own, uid } from '@/lib/db/owned'
import { getSetting, getSettings } from '@/lib/db/settings'
import { SEASON_KEY, storedGoals, type SeasonGoal } from '@/lib/season/goals'
import { RUN_ACTIVITY_TYPES } from '@/lib/analytics/run-view'
import { todayLocal } from '@/lib/dates'
import { builtInBlocks, registerLiveBlocks } from './blocks'
import { applyEvents } from './events'
import { validProfile } from './athlete-profile'
import { BASE_DEFAULTS, baseBlocks, type BaseSettings } from './base-block'
import { kbDaysOf, placeStrength } from './strength'
import type { TrainingBlock } from './types'

export const LIVE_BLOCKS_KEY = 'plan_blocks'
export const BASE_KEY = 'base_block'       // 07-17: BaseSettings { v, paused, capKm }
// `choice`: the method and inputs the block was built from, kept for a rebuild (lib/plan/rebuild-store.ts); entries from
// before v1.1 have none and fall back to their draft.
export interface LiveEntry { block: TrainingBlock; draftId: string; liveAt: string; choice?: { templateId: string; overrides: DraftOverrides } }
export interface StoredLive { v: 1; blocks: LiveEntry[] }

const TTL_MS = 10_000

export const parseLive = (value?: string): LiveEntry[] => {
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
  return parseLive((await getSetting(LIVE_BLOCKS_KEY)) ?? undefined)
}

export const parseBase = (value?: string): BaseSettings => {
  try {
    const v = value ? JSON.parse(value) : null
    if (v?.v !== 1) return BASE_DEFAULTS
    const start = typeof v.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.start) ? v.start : null
    return { v: 1, paused: !!v.paused, capKm: typeof v.capKm === 'number' && v.capKm > 0 ? v.capKm : null, ...(start ? { start } : {}) }
  } catch { return BASE_DEFAULTS }
}

// Live blocks plus the rolling base blocks in the gaps between them (07-17), minor races applied to both.
async function readLiveBlocks(): Promise<TrainingBlock[]> {
  const today = todayLocal()
  const since = format(addDays(parseISO(today), -400), 'yyyy-MM-dd')
  const [rows, runRows] = await Promise.all([
    getSettings([LIVE_BLOCKS_KEY, SEASON_KEY, BASE_KEY, 'athlete_profile']),
    db.select({ date: activities.date, distanceM: activities.distanceM, type: activities.type }).from(activities)
      .where(own(activities, and(gte(activities.date, since), inArray(activities.type, [...RUN_ACTIVITY_TYPES])))),
  ])
  const value = (k: string) => rows.get(k)
  const goals = parseGoals(value(SEASON_KEY))
  const live = parseLive(value(LIVE_BLOCKS_KEY)).map((e) => e.block)
  let profile: unknown = null
  try { profile = JSON.parse(value('athlete_profile') ?? 'null') } catch { /* none */ }
  const runs = runRows.map((r) => ({ date: r.date, km: (r.distanceM ?? 0) / 1000 }))
  const athlete = validProfile(profile) ? profile : null
  const base = baseBlocks({ blocks: [...builtInBlocks(), ...live], runs, today, profile: athlete, settings: parseBase(value(BASE_KEY)) })
  // Kettlebell markers last: after the minor races, so none lands in the 2 days before one; they follow the profile.
  return [...live, ...base].map((b) => placeStrength(applyEvents(b, goals), kbDaysOf(athlete)))
}

// This user's live blocks, by user id: { at, blocks }. Bounded so a long-running instance does not grow without limit.
const TTL_CACHE_MAX = 500
const cache = new Map<string, { at: number; blocks: TrainingBlock[] }>()
const pending = new Map<string, Promise<TrainingBlock[]>>()

// Registers this user's live blocks in the request scope and returns them; `force` skips the cache (after going live or
// offline, after a Saison change).
export async function ensureLiveBlocks(force = false): Promise<TrainingBlock[]> {
  const id = uid()
  const hit = cache.get(id)
  if (!force && hit && Date.now() - hit.at < TTL_MS) {
    registerLiveBlocks(hit.blocks)
    return hit.blocks
  }
  let p = force ? undefined : pending.get(id)
  if (!p) {
    p = readLiveBlocks().then((blocks) => {
      cache.delete(id)
      cache.set(id, { at: Date.now(), blocks })
      if (cache.size > TTL_CACHE_MAX) cache.delete(cache.keys().next().value!)
      return blocks
    }).finally(() => { if (pending.get(id) === p) pending.delete(id) })
    pending.set(id, p)
  }
  const blocks = await p
  registerLiveBlocks(blocks)
  return blocks
}
