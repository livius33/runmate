// AC-2 and AC-4 (Phase 2): user routes answer 401 without a session and run as the signed-in user (profile loaded
// for them); the daily cron syncs every Garmin user in their own scope, and one failure does not stop the others.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { userProfile } from '@/lib/db/schema'
import { currentScope } from '@/lib/scope'
import { hrZones } from '@/lib/analytics/hr'
import { useFakeDb, rowOf } from './fake-db'

const clerk = vi.hoisted(() => ({ userId: null as string | null }))
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ userId: clerk.userId }) }))

const syncs = vi.hoisted(() => ({ seen: [] as { user: string | null; hrMax: number }[] }))
vi.mock('@/lib/garmin/sync-job', () => ({
  runGarminSync: async () => {
    const s = currentScope()
    await new Promise((r) => setTimeout(r, Math.random() * 5))
    syncs.seen.push({ user: s.userId, hrMax: s.profile.hrMax })
    if (s.userId === 'u2') throw new Error('Garmin-Anmeldung fehlgeschlagen')
    return { inserted: 0, updated: 0, enriched: 0, failed: 0, remaining: 0, log: [] }
  },
}))
vi.mock('@/lib/garmin/account', () => ({ garminUserIds: async () => ['u1', 'u2', 'u3', 'u4', 'u5'] }))

const { withUser } = await import('@/lib/server/scope')
const { GET: cron } = await import('@/app/api/cron/daily-sync/route')

// Every user has a profile row with an HFmax of their own: u1 → 181, u2 → 182, …, user-a → 200.
const fake = useFakeDb((q) => {
  if (!/from "user_profile"/.test(q.sql)) return []
  const id = String(q.params[0])
  const hrMax = id === 'user-a' ? 200 : 180 + Number(id.slice(1))
  return [rowOf(userProfile, { userId: id, hrMax, updatedAt: 0 })]
})
afterAll(() => fake.restore())
beforeEach(() => { syncs.seen = []; clerk.userId = null })

describe('withUser', () => {
  const handler = withUser(async () => Response.json({ user: currentScope().userId, z2: hrZones()[1].max }))

  it('ohne Sitzung: 401, der Handler läuft nicht', async () => {
    const res = await handler()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Nicht angemeldet' })
  })

  it('mit Sitzung: läuft als dieser Nutzer mit seinem Profil', async () => {
    clerk.userId = 'user-a'
    const res = await handler()
    expect(await res.json()).toEqual({ user: 'user-a', z2: 142 })   // HFmax 200 from user-a's profile row
  })
})

describe('Täglicher Sync über alle Nutzer', () => {
  const req = (auth?: string) => new Request('http://localhost/api/cron/daily-sync', { headers: auth ? { authorization: auth } : {} })

  it('ohne CRON_SECRET: 401, kein Sync', async () => {
    process.env.CRON_SECRET = 'cron-test'
    expect((await cron(req('Bearer falsch') as never)).status).toBe(401)
    expect(syncs.seen).toEqual([])
  })

  it('jeder Nutzer im eigenen Scope; ein Fehler stoppt die anderen nicht', async () => {
    process.env.CRON_SECRET = 'cron-test'
    const res = await cron(req('Bearer cron-test') as never)
    expect(await res.json()).toMatchObject({ ok: true, users: 5, synced: 4, failed: 1, skipped: 0 })
    expect(syncs.seen.map((s) => [s.user, s.hrMax]).sort()).toEqual([['u1', 181], ['u2', 182], ['u3', 183], ['u4', 184], ['u5', 185]])
  })
})
