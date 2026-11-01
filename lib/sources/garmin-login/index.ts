// Source `garmin`: Garmin Connect with the user's own username and password (unofficial, like the Garmin Connect app).
// Experimental: Garmin can change its login at any time, and MFA is not supported. One client per request and user
// (lib/scope.ts cache), built from that user's encrypted account; never shared or kept in module state.
import { z } from 'zod'
import { uid } from '@/lib/db/owned'
import { currentScope } from '@/lib/scope'
import type { ActivitySource, ActivitySummary, ListQuery, SourceStatus } from '@/lib/sources/types'
import { isImportedSport } from '@/lib/sources/sports'
import { createGarminClient, type GarminClient } from './client'
import { classifyGarminError, garminError, GARMIN_MESSAGES } from './errors'
import {
  deleteGarminAccount, garminAccountStatus, garminUserIds, loadGarminAccount, markGarminSynced, saveGarminAccount, saveGarminSession,
  type GarminSession,
} from './account'
import { parseDetailStreams, toLaps, toSummary, type GarminActivityDetailsResponse, type GarminListActivity, type GarminSplit } from './map'

const CLIENT_KEY = 'garmin.client'
const API = 'https://connectapi.garmin.com/activity-service/activity'
const PAGE = 50

export const CONSENT_TEXT = [
  'Runmate speichert deine Garmin-Zugangsdaten verschlüsselt und nutzt sie nur, um deine eigenen Aktivitäten von Garmin Connect abzurufen.',
  'Du kannst die Verbindung und die gespeicherten Zugangsdaten jederzeit hier löschen.',
  'Das ist kein offizieller Garmin-Zugang: Garmin kann ihn jederzeit ändern oder sperren, dann funktioniert die Synchronisierung nicht mehr.',
]

const Credentials = z.object({
  username: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
  consent: z.literal(true),
})

async function client(): Promise<GarminClient> {
  uid()                                     // a user scope, or 401
  const cache = currentScope().cache
  const hit = cache.get(CLIENT_KEY) as Promise<GarminClient> | undefined
  if (hit) return hit
  const p = restore().catch((err) => { cache.delete(CLIENT_KEY); throw err })
  cache.set(CLIENT_KEY, p)
  return p
}

async function restore(): Promise<GarminClient> {
  const account = await loadGarminAccount()
  if (!account) throw garminError('not-connected')
  const { username, password, session } = account
  const gc = createGarminClient({ username, password })
  if (session?.oauth2) {
    try {
      gc.loadToken(session.oauth1 as never, session.oauth2 as never)
      await gc.getUserProfile()           // cheap probe: throws when the OAuth2 token expired
      return gc
    } catch {
      // stale session → full login
    }
  }
  try {
    await gc.login(username, password)
  } catch (err) {
    throw classifyGarminError(err, 'login')
  }
  await saveGarminSession(gc.exportToken() as GarminSession)
  return gc
}

async function call<T>(fn: (gc: GarminClient) => Promise<T>): Promise<T> {
  const gc = await client()
  try { return await fn(gc) } catch (err) { throw classifyGarminError(err) }
}

const startMs = (a: ActivitySummary) => Date.parse(a.startUtc ?? `${a.startLocal}Z`)

export const garminLoginSource: ActivitySource = {
  meta: {
    id: 'garmin',
    label: 'Garmin Connect (Anmeldung)',
    description: 'Läufe, Krafttraining und Detaildaten direkt aus Garmin Connect, mit deinen Garmin-Zugangsdaten.',
    auth: 'credentials',
    experimental: true,
    available: true,
    capabilities: { activities: true, detailStreams: true, dailyWellness: false, mode: 'pull', history: true, runs: true },
  },

  async status(): Promise<SourceStatus> {
    const s = await garminAccountStatus()
    const at = (t: number | null) => (t ? new Date(t * 1000).toISOString() : null)
    return {
      connected: s.hasCredentials,
      lastSyncAt: at(s.syncedAt),
      error: s.errorCode ? { code: s.errorCode, message: GARMIN_MESSAGES[s.errorCode], at: at(s.errorAt) } : null,
      details: { hasSession: s.hasSession, sessionUpdatedAt: s.sessionUpdatedAt, consentedAt: s.consentedAt },
    }
  },

  // Logs in first; only a working login is saved (with the session and the time of consent).
  async connect(input: unknown) {
    const parsed = Credentials.safeParse(input)
    if (!parsed.success) throw garminError('invalid')
    const { username, password } = parsed.data
    const gc = createGarminClient({ username, password })
    try {
      await gc.login(username, password)
    } catch (err) {
      throw classifyGarminError(err, 'login')
    }
    await saveGarminAccount(username, password, (gc.exportToken() as GarminSession) ?? null)
    currentScope().cache.set(CLIENT_KEY, Promise.resolve(gc))
    return garminLoginSource.status()
  },

  async disconnect() {
    currentScope().cache.delete(CLIENT_KEY)
    await deleteGarminAccount()
  },

  async listActivities(q: ListQuery) {
    const imported = (a: GarminListActivity) => isImportedSport(a.activityType.typeKey)
    if ('page' in q) {
      const page = await call((gc) => gc.getActivities(q.page * q.pageSize, q.pageSize)) as GarminListActivity[]
      return { items: page.filter(imported).map(toSummary), hasMore: page.length === q.pageSize }
    }
    const since = q.since.getTime()
    const items: ActivitySummary[] = []
    for (let start = 0; ; start += PAGE) {
      const page = await call((gc) => gc.getActivities(start, PAGE)) as GarminListActivity[]
      for (const a of page) {
        const s = toSummary(a)
        if (startMs(s) < since) return { items, hasMore: false }
        if (imported(a)) items.push(s)
      }
      if (page.length < PAGE) return { items, hasMore: false }
    }
  },

  async getActivityDetail(id: string) {
    if (!/^\d+$/.test(id)) throw garminError('unknown')
    let splits: GarminSplit[] = []
    try {
      splits = (await call((gc) => gc.get<{ lapDTOs: GarminSplit[] }>(`${API}/${id}/splits`))).lapDTOs ?? []
    } catch (err: any) {
      if (err?.code === 'rate-limited' || err?.code === 'not-connected') throw err   // splits are optional otherwise
    }
    const chart = await call((gc) => gc.get<GarminActivityDetailsResponse>(`${API}/${id}/details?maxChartSize=1000&maxPolylineSize=1000`))
    return { laps: toLaps(splits), streams: parseDetailStreams(chart) }
  },

  connectedUsers: garminUserIds,

  async markSynced(error) {
    await markGarminSynced(error?.code ?? null)
  },
}
