// Every data source Runmate knows. Adding one (Strava, Polar, the official Garmin API) = implement ActivitySource in
// lib/sources/ and list it here; Settings, sync, cron and import pick it up from its metadata.
import { garminLoginSource } from './garmin-login'
import { garminApiSource } from './garmin-api'
import { appleHealthSource } from './apple-health'
import { fileSource } from './file'
import type { ActivitySource, SourceId } from './types'

export const SOURCES: ActivitySource[] = [garminLoginSource, garminApiSource, appleHealthSource, fileSource]

export function source(id: SourceId): ActivitySource | null {
  return SOURCES.find((s) => s.meta.id === id) ?? null
}

export const pullSources = () => SOURCES.filter((s) => s.meta.available && s.meta.capabilities.mode === 'pull')

// Pull sources this user has connected (the ones a sync runs for).
export async function connectedPullSources(): Promise<ActivitySource[]> {
  const all = pullSources()
  const status = await Promise.all(all.map((s) => s.status()))
  return all.filter((_, i) => status[i].connected)
}

// Whether a connected source other than `except` delivers runs (pull or push; file uploads are one-off and deduped).
export async function hasOtherRunSource(except: SourceId): Promise<boolean> {
  const candidates = SOURCES.filter((s) => s.meta.id !== except && s.meta.available && s.meta.capabilities.runs && s.meta.capabilities.mode !== 'upload')
  const status = await Promise.all(candidates.map((s) => s.status()))
  return status.some((s) => s.connected)
}

// Whether this user has a connected source that delivers nights or daily values (Garmin login, Apple Health): only
// then do the cards show sleep and recovery.
export async function hasWellnessSource(): Promise<boolean> {
  const candidates = SOURCES.filter((s) => s.meta.available && s.meta.capabilities.dailyWellness)
  const status = await Promise.all(candidates.map((s) => s.status()))
  return status.some((s) => s.connected)
}

// cross-user: whom the daily cron syncs — every user with a connected pull source, least recently synced first.
export async function usersToSync(): Promise<string[]> {
  const lists = await Promise.all(pullSources().map((s) => s.connectedUsers?.() ?? Promise.resolve([])))
  return [...new Set(lists.flat())]
}
